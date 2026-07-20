import { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { schema, applyMigrations } from "../lib/schema.js";
import { applySecurityMigrations } from "../lib/schema/security-migrations.js";
import { applyReleaseMigrations } from "../lib/schema/release-migrations.js";
import { applyLocalizationMigrations } from "../lib/schema/localization-migrations.js";
import { applyMoneyMigrations } from "../lib/schema/money-migrations.js";

const SESSION_TOKEN = randomBytes(32).toString("base64url");
const DESKTOP_ROUTES = ["/dashboard", "/properties", "/tenants", "/leases", "/invoices", "/reports", "/tenant-portal"];
const MOBILE_RECORD_ROUTES = ["/tenants", "/leases", "/invoices"];
const INTERACTIVE_ROLES = new Set(["button", "link", "textbox", "searchbox", "combobox", "checkbox", "radio"]);
const assert = (value, message) => { if (!value) throw new Error(message); };

function seed(filename) {
  const db = new Database(filename, { create: true, strict: true });
  try {
    db.exec(schema);
    applySecurityMigrations(db);
    applyMigrations(db);
    applyReleaseMigrations(db);
    applyLocalizationMigrations(db);
    applyMoneyMigrations(db);
    const ownerId = Number(db.query("INSERT INTO users(name,email,password_hash,role,status) VALUES('Browser Owner','owner.browser@example.test','browser-gate-session-only','owner','active')").run().lastInsertRowid);
    for (const [key, value] of Object.entries({ installation_state: `complete:${ownerId}`, company_name: "Browser Gate Workspace", default_country: "Test Country", default_currency: "USD", timezone: "UTC", primary_module: "residential" })) {
      db.query("INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES($key,$value,CURRENT_TIMESTAMP)").run({ key, value });
    }
    ["residential", "pg_coliving", "hostel", "student_housing", "staff_housing", "commercial"].forEach((moduleId, index) => db.query("INSERT OR REPLACE INTO workspace_modules(module_id,enabled,sort_order,settings_json) VALUES($moduleId,1,$order,'{}')").run({ moduleId, order: (index + 1) * 10 }));
    const propertyId = Number(db.query("INSERT INTO properties(name,type,module_id,address,city,country,currency,status) VALUES('Browser House','apartment','residential','1 Verification Road','Test City','Test Country','USD','active')").run().lastInsertRowid);
    const unitId = Number(db.query("INSERT INTO units(property_id,name,unit_type,capacity,monthly_rate,deposit,status) VALUES($propertyId,'Unit 101','room',1,1250,1250,'occupied')").run({ propertyId }).lastInsertRowid);
    const tenantId = Number(db.query("INSERT INTO tenants(property_id,full_name,email,phone,identity_number,emergency_contact,status) VALUES($propertyId,'Browser Resident','resident.browser@example.test','15550001001','BROWSER-ID','Support · 15550001002','active')").run({ propertyId }).lastInsertRowid);
    const leaseId = Number(db.query("INSERT INTO leases(property_id,unit_id,reference,start_date,end_date,monthly_rent,deposit,billing_day,status) VALUES($propertyId,$unitId,'LEASE-BROWSER','2026-07-01','2027-06-30',1250,1250,1,'active')").run({ propertyId, unitId }).lastInsertRowid);
    db.query("INSERT INTO lease_tenants(lease_id,tenant_id,is_primary) VALUES($leaseId,$tenantId,1)").run({ leaseId, tenantId });
    db.query("INSERT INTO invoices(property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,amount_paid,rent_period,charge_type,status) VALUES($propertyId,$leaseId,$tenantId,'INV-BROWSER','Monthly rent','2026-07-01','2026-07-05',1250,250,'2026-07','rent','part_paid')").run({ propertyId, leaseId, tenantId });
    db.query("INSERT INTO tenant_accounts(tenant_id,email,status,password_hash,invited_at,activated_at) VALUES($tenantId,'resident.browser@example.test','active','browser-gate-session-only',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run({ tenantId });
    db.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($ownerId,$hash,'2099-01-01T00:00:00.000Z')").run({ ownerId, hash: createHash("sha256").update(SESSION_TOKEN).digest("hex") });
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally { db.close(true); }
}

class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.events = new Map(); this.listeners = new Map(); }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Chrome DevTools connection timed out")), 10000);
      this.ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Chrome DevTools connection failed")); }, { once: true });
    });
    this.ws.addEventListener("message", ({ data }) => this.receive(JSON.parse(String(data))));
  }
  receive(message) {
    if (message.id) {
      const pending = this.pending.get(message.id); if (!pending) return;
      this.pending.delete(message.id);
      return message.error ? pending.reject(new Error(`${pending.method}: ${message.error.message}`)) : pending.resolve(message.result || {});
    }
    const key = `${message.sessionId || "browser"}:${message.method}`;
    const queue = this.events.get(key);
    if (queue?.length) { const item = queue.shift(); clearTimeout(item.timer); item.resolve(message.params || {}); }
    for (const listener of this.listeners.get(key) || []) listener(message.params || {});
  }
  send(method, params = {}, sessionId = null) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject, method }); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  }
  once(method, sessionId, timeout = 20000) {
    const key = `${sessionId || "browser"}:${method}`;
    return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout); const queue = this.events.get(key) || []; queue.push({ resolve, timer }); this.events.set(key, queue); });
  }
  on(method, sessionId, listener) { const key = `${sessionId}:${method}`; const list = this.listeners.get(key) || []; list.push(listener); this.listeners.set(key, list); }
  close() { try { this.ws?.close(); } catch {} }
}

async function waitHttp(url, process, label) {
  let last = "no response";
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (process?.exitCode !== null) throw new Error(`${label} exited early with code ${process.exitCode}`);
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); if (response.ok) return response; last = `HTTP ${response.status}`; } catch (error) { last = error.message; }
    await Bun.sleep(250);
  }
  throw new Error(`${label} did not become ready: ${last}`);
}

async function stop(process) {
  if (!process || process.exitCode !== null) return;
  try { process.kill("SIGTERM"); } catch {}
  await Promise.race([process.exited, Bun.sleep(4000)]);
  if (process.exitCode === null) try { process.kill("SIGKILL"); } catch {}
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result?.value;
}
async function navigate(cdp, sessionId, url) { const loaded = cdp.once("Page.loadEventFired", sessionId); await cdp.send("Page.navigate", { url }, sessionId); await loaded; }
async function waitPath(cdp, sessionId, expected) { for (let i = 0; i < 80; i += 1) { if (await evaluate(cdp, sessionId, "location.pathname") === expected) return; await Bun.sleep(250); } throw new Error(`Browser did not reach ${expected}`); }

async function audit(cdp, sessionId, route, mobile = false) {
  const dom = await evaluate(cdp, sessionId, `(() => {
    const duplicateIds=[...document.querySelectorAll('[id]')].map(n=>n.id).filter((id,i,a)=>id&&a.indexOf(id)!==i);
    const missingAlt=[...document.images].filter(n=>!n.hasAttribute('alt')).length;
    const unnamed=[...document.querySelectorAll('button,a[href],input,select,textarea')].filter(n=>{if(n.matches('[type="hidden"],[hidden],[aria-hidden="true"]'))return false;const by=n.getAttribute('aria-labelledby');const byText=by?by.split(/\\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' '):'';const labels=n.labels?[...n.labels].map(l=>l.textContent||'').join(' '):'';return !(n.getAttribute('aria-label')||byText||labels||n.textContent||n.title||n.placeholder)?.trim();}).length;
    const tables=[...document.querySelectorAll('table.people-table, table.agreements-table, table.invoices-table')].map(t=>({rows:t.tBodies[0]?.rows.length||0,table:getComputedStyle(t).display,row:t.tBodies[0]?.rows[0]?getComputedStyle(t.tBodies[0].rows[0]).display:null,overflow:t.closest('.table-wrap')?t.closest('.table-wrap').scrollWidth-t.closest('.table-wrap').clientWidth:0}));
    return {title:document.title,lang:document.documentElement.lang,main:document.querySelectorAll('main').length,h1:document.querySelectorAll('h1').length,duplicateIds:[...new Set(duplicateIds)],missingAlt,unnamed,overflow:document.documentElement.scrollWidth - window.innerWidth,tables};
  })()`);
  assert(dom.title?.trim(), `${route}: empty title`); assert(dom.lang?.trim(), `${route}: missing html language`); assert(dom.main === 1, `${route}: expected one main landmark`); assert(dom.h1 === 1, `${route}: expected one h1`); assert(!dom.duplicateIds.length, `${route}: duplicate IDs ${dom.duplicateIds.join(", ")}`); assert(dom.missingAlt === 0, `${route}: image without alt text`); assert(dom.unnamed === 0, `${route}: unnamed native control`);
  if (mobile) { assert(dom.overflow <= 1, `${route}: page overflows mobile viewport by ${dom.overflow}px`); assert(dom.tables.length, `${route}: record table missing`); for (const table of dom.tables) { assert(table.rows, `${route}: seeded row missing`); assert(table.table === "block" && table.row === "grid", `${route}: record-card layout inactive`); assert(table.overflow <= 1, `${route}: record table scrolls horizontally by ${table.overflow}px`); } }
  const tree = await cdp.send("Accessibility.getFullAXTree", {}, sessionId);
  const unnamedAx = (tree.nodes || []).filter(node => !node.ignored && INTERACTIVE_ROLES.has(node.role?.value) && !String(node.name?.value || "").trim());
  assert(!unnamedAx.length, `${route}: accessibility tree has ${unnamedAx.length} unnamed interactive node(s)`);
  return dom.title;
}

const root = path.join(tmpdir(), `nivasaos-browser-${randomBytes(6).toString("hex")}`);
const artifacts = path.resolve("artifacts/browser");
const appPort = 35000 + Math.floor(Math.random() * 1000);
const debugPort = 36000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${appPort}`;
const browser = process.env.NIVASA_BROWSER_BIN || Bun.which("google-chrome") || Bun.which("google-chrome-stable") || Bun.which("chromium") || Bun.which("chromium-browser");
const bun = Bun.which("bun") || process.execPath;
const env = { ...process.env, NODE_ENV: "production", NIVASA_DB_PATH: path.join(root, "nivasaos.sqlite"), NIVASA_UPLOAD_DIR: path.join(root, "uploads"), NIVASA_BACKUP_DIR: path.join(root, "backups"), NIVASA_PUBLIC_URL: baseUrl, NEXT_PUBLIC_APP_URL: baseUrl, NIVASA_ALLOW_INSECURE_LOCALHOST: "1" };
let server, chrome, cdp;
const errors = [];
const report = { generatedAt: new Date().toISOString(), desktop: [], mobile: [] };

try {
  assert(browser, "Chrome or Chromium was not found. Set NIVASA_BROWSER_BIN to its executable path");
  await fsp.mkdir(env.NIVASA_UPLOAD_DIR, { recursive: true, mode: 0o700 }); await fsp.mkdir(env.NIVASA_BACKUP_DIR, { recursive: true, mode: 0o700 });
  await fsp.rm(artifacts, { recursive: true, force: true }); await fsp.mkdir(artifacts, { recursive: true, mode: 0o700 });
  const profile = path.join(root, "chrome-profile"); await fsp.mkdir(profile, { recursive: true, mode: 0o700 }); seed(env.NIVASA_DB_PATH);
  server = Bun.spawn([bun, "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(appPort)], { cwd: process.cwd(), env, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
  await waitHttp(`${baseUrl}/api/health`, server, "NivasaOS production server");
  chrome = Bun.spawn([browser, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", "--disable-extensions", "--disable-sync", "--no-first-run", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdin: "ignore", stdout: "inherit", stderr: "inherit" });
  const version = await (await waitHttp(`http://127.0.0.1:${debugPort}/json/version`, chrome, "Headless Chrome")).json();
  assert(version.webSocketDebuggerUrl, "Chrome did not expose DevTools"); cdp = new CDP(version.webSocketDebuggerUrl); await cdp.connect();
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" }); const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId); await cdp.send("Runtime.enable", {}, sessionId); await cdp.send("Network.enable", {}, sessionId); await cdp.send("Accessibility.enable", {}, sessionId);
  cdp.on("Runtime.exceptionThrown", sessionId, event => errors.push(event.exceptionDetails?.text || "runtime exception")); cdp.on("Runtime.consoleAPICalled", sessionId, event => { if (["error", "assert"].includes(event.type)) errors.push(`console.${event.type}`); });
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(cdp, sessionId, `${baseUrl}/login`); await audit(cdp, sessionId, "/login");
  const cookie = await cdp.send("Network.setCookie", { name: "nivasa_session", value: SESSION_TOKEN, url: baseUrl, httpOnly: true, sameSite: "Lax" }, sessionId);
  assert(cookie.success !== false, "Chrome rejected the authenticated session cookie");
  await navigate(cdp, sessionId, `${baseUrl}/dashboard`); await waitPath(cdp, sessionId, "/dashboard");
  for (const route of DESKTOP_ROUTES) { await navigate(cdp, sessionId, `${baseUrl}${route}`); await waitPath(cdp, sessionId, route); report.desktop.push({ route, title: await audit(cdp, sessionId, route) }); }
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
  for (const route of MOBILE_RECORD_ROUTES) { await navigate(cdp, sessionId, `${baseUrl}${route}`); await waitPath(cdp, sessionId, route); const title = await audit(cdp, sessionId, route, true); const file = path.join(artifacts, `${route.slice(1)}-mobile.png`); const image = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId); await fsp.writeFile(file, Buffer.from(image.data, "base64"), { mode: 0o600 }); report.mobile.push({ route, title, screenshot: path.basename(file) }); }
  assert(!errors.length, `Browser runtime errors: ${errors.join(" | ")}`); report.browser = version.Browser; await fsp.writeFile(path.join(artifacts, "browser-gate-report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(`Authenticated browser, accessibility-tree, and responsive record-card checks passed in ${report.browser}.`);
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error); await fsp.mkdir(artifacts, { recursive: true }).catch(() => {}); await fsp.writeFile(path.join(artifacts, "browser-gate-report.json"), JSON.stringify(report, null, 2)).catch(() => {}); console.error(report.failure); process.exitCode = 1;
} finally { cdp?.close(); await stop(chrome); await stop(server); if (fs.existsSync(root)) await fsp.rm(root, { recursive: true, force: true }); }
process.exit(process.exitCode || 0);
