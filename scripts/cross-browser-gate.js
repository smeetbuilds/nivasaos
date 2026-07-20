import { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrateDatabase } from "../lib/schema/migrate.js";

const assert = (value, message) => { if (!value) throw new Error(message); };
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
const tokens = { owner: randomBytes(32).toString("base64url"), staff: randomBytes(32).toString("base64url"), tenant: randomBytes(32).toString("base64url") };
const MOBILE_RECORD_ROUTES = ["/units", "/payments", "/audit", "/reports"];

function seed(filename) {
  const db = new Database(filename, { create: true, strict: true });
  try {
    migrateDatabase(db, { applicationVersion: "cross-browser-gate" });
    const ownerId = Number(db.query("INSERT INTO users(name,email,password_hash,role,status) VALUES('Browser Owner','owner.matrix@example.test','session-only','owner','active')").run().lastInsertRowid);
    const staffId = Number(db.query("INSERT INTO users(name,email,password_hash,role,status) VALUES('Scoped Staff','staff.matrix@example.test','session-only','staff','active')").run().lastInsertRowid);
    for (const [key, value] of Object.entries({ installation_state: `complete:${ownerId}`, company_name: "Browser Matrix Workspace", default_country: "Test Country", default_currency: "USD", timezone: "UTC", primary_module: "residential" })) db.query("INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES($key,$value,CURRENT_TIMESTAMP)").run({ key, value });
    ["residential", "pg_coliving", "hostel", "student_housing", "staff_housing", "commercial"].forEach((moduleId, index) => db.query("INSERT OR REPLACE INTO workspace_modules(module_id,enabled,sort_order,settings_json) VALUES($moduleId,1,$order,'{}')").run({ moduleId, order: (index + 1) * 10 }));
    const propertyId = Number(db.query("INSERT INTO properties(name,type,module_id,address,city,country,currency,status) VALUES('Matrix House','apartment','residential','1 Matrix Road','Test City','Test Country','USD','active')").run().lastInsertRowid);
    const unitId = Number(db.query("INSERT INTO units(property_id,name,unit_type,capacity,monthly_rate,deposit,status) VALUES($propertyId,'Unit 201','room',1,1250,1250,'occupied')").run({ propertyId }).lastInsertRowid);
    const tenantId = Number(db.query("INSERT INTO tenants(property_id,full_name,email,phone,identity_number,emergency_contact,status) VALUES($propertyId,'Matrix Resident','resident.matrix@example.test','15550002001','MATRIX-ID','Support · 15550002002','active')").run({ propertyId }).lastInsertRowid);
    const leaseId = Number(db.query("INSERT INTO leases(property_id,unit_id,reference,start_date,end_date,monthly_rent,deposit,billing_day,status) VALUES($propertyId,$unitId,'LEASE-MATRIX','2026-07-01','2027-06-30',1250,1250,1,'active')").run({ propertyId, unitId }).lastInsertRowid);
    db.query("INSERT INTO lease_tenants(lease_id,tenant_id,is_primary) VALUES($leaseId,$tenantId,1)").run({ leaseId, tenantId });
    const invoiceId = Number(db.query("INSERT INTO invoices(property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,amount_paid,rent_period,charge_type,status) VALUES($propertyId,$leaseId,$tenantId,'INV-MATRIX','Monthly rent','2026-07-01','2026-07-05',1250,250,'2026-07','rent','part_paid')").run({ propertyId, leaseId, tenantId }).lastInsertRowid);
    db.query("INSERT INTO payments(property_id,invoice_id,tenant_id,reference,amount,method,paid_at,recorded_by) VALUES($propertyId,$invoiceId,$tenantId,'PAY-MATRIX',250,'bank_transfer','2026-07-02',$ownerId)").run({ propertyId, invoiceId, tenantId, ownerId });
    db.query("INSERT INTO audit_log(actor_user_id,property_id,action,entity_type,entity_id,summary,metadata) VALUES($ownerId,$propertyId,'create','payment',1,'Recorded browser matrix payment','{\"source\":\"cross-browser\"}')").run({ ownerId, propertyId });
    db.query("INSERT INTO user_properties(user_id,property_id) VALUES($staffId,$propertyId)").run({ staffId, propertyId });
    for (const permission of ["portfolio.view", "people.manage", "maintenance.manage"]) db.query("INSERT INTO permission_grants(user_id,property_id,permission,allowed,granted_by) VALUES($staffId,$propertyId,$permission,1,$ownerId)").run({ staffId, propertyId, permission, ownerId });
    const accountId = Number(db.query("INSERT INTO tenant_accounts(tenant_id,email,status,password_hash,invited_at,activated_at) VALUES($tenantId,'resident.matrix@example.test','active','session-only',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run({ tenantId }).lastInsertRowid);
    db.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($userId,$hash,'2099-01-01T00:00:00.000Z')").run({ userId: ownerId, hash: tokenHash(tokens.owner) });
    db.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($userId,$hash,'2099-01-01T00:00:00.000Z')").run({ userId: staffId, hash: tokenHash(tokens.staff) });
    db.query("INSERT INTO tenant_sessions(account_id,token_hash,expires_at) VALUES($accountId,$hash,'2099-01-01T00:00:00.000Z')").run({ accountId, hash: tokenHash(tokens.tenant) });
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    return { propertyId, tenantId };
  } finally { db.close(true); }
}

async function waitHealth(url, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Production server exited with ${child.exitCode}`);
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); if (response.ok) return; } catch {}
    await Bun.sleep(250);
  }
  throw new Error("Production server did not become healthy");
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  try { child.kill("SIGTERM"); } catch {}
  await Promise.race([child.exited, Bun.sleep(4000)]);
  if (child.exitCode === null) try { child.kill("SIGKILL"); } catch {}
}

async function addSession(context, baseUrl, name, value, pathName = "/") {
  await context.addCookies([{ name, value, url: `${baseUrl}${pathName}`, httpOnly: true, sameSite: "Lax", secure: false }]);
}

async function assertPage(page, route) {
  const response = await page.goto(route, { waitUntil: "networkidle" });
  assert(response && response.status() < 400, `${route}: returned ${response?.status() || "no response"}`);
  assert((await page.title()).trim(), `${route}: missing title`);
  assert(await page.locator("main").count() === 1, `${route}: expected one main landmark`);
  assert(await page.locator("h1").count() === 1, `${route}: expected one h1`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `${route}: horizontal overflow ${overflow}px`);
}

async function assertMobileRecordRoute(page, baseUrl, route, engineName, artifacts) {
  await assertPage(page, `${baseUrl}${route}`);
  const table = page.locator("table[data-mobile-cards]").first();
  assert(await table.count() === 1, `${route}: mobile record table is missing`);
  const row = table.locator("tbody tr").first();
  assert(await row.count() === 1, `${route}: seeded mobile record row is missing`);
  const layout = await row.evaluate((node) => ({ display: getComputedStyle(node).display, overflow: node.closest(".table-wrap")?.scrollWidth - node.closest(".table-wrap")?.clientWidth }));
  assert(layout.display === "grid", `${route}: mobile record row did not render as a grid`);
  assert(Number(layout.overflow || 0) <= 1, `${route}: mobile table container overflows by ${layout.overflow}px`);
  const labels = await row.locator("td[data-label]").count();
  assert(labels > 0, `${route}: mobile record cells have no explicit labels`);
  const filename = `${engineName}-${route.slice(1)}-mobile.png`;
  await page.screenshot({ path: path.join(artifacts, filename), fullPage: true });
  return filename;
}

async function structuredValidationAndFocus(page, baseUrl) {
  await assertPage(page, `${baseUrl}/properties`);
  const trigger = page.getByRole("button", { name: "Add property" });
  await trigger.focus();
  await trigger.click();
  const dialog = page.locator("#property-modal");
  await dialog.waitFor({ state: "visible" });
  assert(await dialog.evaluate((node) => node.contains(document.activeElement)), "Dialog did not receive focus after opening");
  await dialog.locator('input[name="name"]').fill("Preserved Matrix Value");
  await dialog.locator('input[name="address"]').fill("2 Validation Road");
  await dialog.locator('select[name="moduleId"]').evaluate((select) => { const option = new Option("Invalid module", "invalid-module", true, true); select.add(option); select.value = option.value; });
  await dialog.getByRole("button", { name: "Create property" }).click();
  await dialog.locator("[data-action-error-summary]").waitFor();
  assert(await dialog.locator('input[name="name"]').inputValue() === "Preserved Matrix Value", "Rejected form value was not preserved");
  assert(await dialog.locator('select[name="moduleId"]').getAttribute("aria-invalid") === "true", "Invalid field was not annotated");
  assert(await dialog.locator('select[name="moduleId"]').evaluate((node) => node === document.activeElement), "First invalid field did not receive focus");
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    assert(await dialog.evaluate((node) => node.contains(document.activeElement)), "Tab focus escaped the modal dialog");
  }
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert(await trigger.evaluate((node) => node === document.activeElement), "Focus did not return to the dialog trigger");
}

async function delegatedStaff(page, baseUrl) {
  for (const route of ["/dashboard", "/tenants", "/maintenance"]) await assertPage(page, `${baseUrl}${route}`);
  await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
  assert(new URL(page.url()).pathname === "/dashboard", "Delegated staff reached billing without permission");
  await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle" });
  assert(new URL(page.url()).pathname === "/dashboard", "Delegated staff reached settings without permission");
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
  assert(await page.getByRole("link", { name: "People" }).count() > 0, "Delegated navigation omitted an allowed route");
  assert(await page.getByRole("link", { name: "Invoices" }).count() === 0, "Delegated navigation exposed a forbidden route");
}

async function tenantWorkflow(page, baseUrl, databasePath) {
  await assertPage(page, `${baseUrl}/portal`);
  assert(await page.getByText("INV-MATRIX", { exact: false }).count() > 0, "Tenant portal did not expose the tenant invoice");
  await assertPage(page, `${baseUrl}/portal/profile`);
  const phone = page.locator('input[name="phone"]');
  assert(await phone.count() === 1, "Tenant profile phone control is missing");
  await phone.fill("15550002999");
  const form = phone.locator("xpath=ancestor::form");
  await form.locator('button[type="submit"]').click();
  await page.waitForLoadState("networkidle");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const db = new Database(databasePath, { readonly: true, strict: true });
    const value = db.query("SELECT phone FROM tenants WHERE email='resident.matrix@example.test'").get()?.phone;
    db.close(true);
    if (value === "15550002999") return;
    await Bun.sleep(100);
  }
  throw new Error("Tenant profile workflow did not persist the submitted phone number");
}

const root = path.join(tmpdir(), `nivasaos-cross-browser-${randomBytes(6).toString("hex")}`);
const databasePath = path.join(root, "nivasaos.sqlite");
const artifacts = path.resolve("artifacts/cross-browser");
const port = 37000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: "production", NIVASA_DB_PATH: databasePath, NIVASA_UPLOAD_DIR: path.join(root, "uploads"), NIVASA_BACKUP_DIR: path.join(root, "backups"), NIVASA_PUBLIC_URL: baseUrl, NEXT_PUBLIC_APP_URL: baseUrl, NIVASA_ALLOW_INSECURE_LOCALHOST: "1" };
let server;
const report = { generatedAt: new Date().toISOString(), engines: [] };

try {
  let playwright;
  try { playwright = await import("playwright"); } catch { throw new Error("Playwright 1.61.1 is required for gate:cross-browser. Install it temporarily or use the pinned CircleCI job."); }
  await fsp.mkdir(env.NIVASA_UPLOAD_DIR, { recursive: true, mode: 0o700 });
  await fsp.mkdir(env.NIVASA_BACKUP_DIR, { recursive: true, mode: 0o700 });
  await fsp.rm(artifacts, { recursive: true, force: true });
  await fsp.mkdir(artifacts, { recursive: true, mode: 0o700 });
  seed(databasePath);
  const bun = Bun.which("bun") || process.execPath;
  server = Bun.spawn([bun, "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: process.cwd(), env, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
  await waitHealth(`${baseUrl}/api/health`, server);

  for (const [engineName, engine] of [["firefox", playwright.firefox], ["webkit", playwright.webkit]]) {
    const browser = await engine.launch({ headless: true });
    const runtimeErrors = [];
    try {
      const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await addSession(ownerContext, baseUrl, "nivasa_session", tokens.owner);
      const owner = await ownerContext.newPage();
      owner.on("pageerror", (error) => runtimeErrors.push(`owner:${error.message}`));
      owner.on("console", (message) => { if (["error", "assert"].includes(message.type())) runtimeErrors.push(`owner:console.${message.type()}:${message.text()}`); });
      await structuredValidationAndFocus(owner, baseUrl);
      await owner.setViewportSize({ width: 390, height: 844 });
      const screenshots = [];
      for (const route of MOBILE_RECORD_ROUTES) screenshots.push(await assertMobileRecordRoute(owner, baseUrl, route, engineName, artifacts));
      await ownerContext.close();

      const staffContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await addSession(staffContext, baseUrl, "nivasa_session", tokens.staff);
      const staff = await staffContext.newPage();
      staff.on("pageerror", (error) => runtimeErrors.push(`staff:${error.message}`));
      await delegatedStaff(staff, baseUrl);
      await staffContext.close();

      const tenantContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await addSession(tenantContext, baseUrl, "nivasa_tenant_session", tokens.tenant, "/portal");
      const tenant = await tenantContext.newPage();
      tenant.on("pageerror", (error) => runtimeErrors.push(`tenant:${error.message}`));
      await tenantWorkflow(tenant, baseUrl, databasePath);
      const tenantScreenshot = `${engineName}-tenant-portal-mobile.png`;
      await tenant.screenshot({ path: path.join(artifacts, tenantScreenshot), fullPage: true });
      screenshots.push(tenantScreenshot);
      await tenantContext.close();
      assert(runtimeErrors.length === 0, `${engineName}: ${runtimeErrors.join(" | ")}`);
      report.engines.push({ engine: engineName, status: "passed", screenshots });
    } finally { await browser.close(); }
  }
  await fsp.writeFile(path.join(artifacts, "cross-browser-report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log("Firefox and WebKit owner, delegated-staff, tenant-workflow, keyboard-focus, structured-validation, lower-frequency mobile records, and screenshot checks passed.");
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  await fsp.mkdir(artifacts, { recursive: true }).catch(() => {});
  await fsp.writeFile(path.join(artifacts, "cross-browser-report.json"), JSON.stringify(report, null, 2)).catch(() => {});
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await stop(server);
  if (fs.existsSync(root)) await fsp.rm(root, { recursive: true, force: true });
}
process.exit(process.exitCode || 0);
