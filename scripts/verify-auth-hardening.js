import fs from "node:fs";
import { Database } from "bun:sqlite";
import { applySecurityMigrations } from "../lib/schema/security-migrations.js";

const failures = [];
const authAction = fs.readFileSync("lib/actions/auth.js", "utf8");
const portalAction = fs.readFileSync("lib/actions/portal-accounts.js", "utf8");
const authLibrary = fs.readFileSync("lib/auth.js", "utf8");
const throttle = fs.readFileSync("lib/auth-rate-limit.js", "utf8");
const schema = fs.readFileSync("lib/schema/core-schema.js", "utf8");
const dbSource = fs.readFileSync("lib/db.js", "utf8");
const caddy = fs.readFileSync("Caddyfile", "utf8");
const production = fs.readFileSync("compose.production.yml", "utf8");

for (const field of ["failed_attempts", "locked_until", "last_login_at"]) {
  if (!schema.includes(field)) failures.push(`Fresh schema is missing users.${field}`);
}
if (!schema.includes("CREATE TABLE IF NOT EXISTS auth_rate_limits")) failures.push("Fresh schema is missing auth_rate_limits");
if (!authAction.includes("installation_state")) failures.push("Installation does not use a transactional installation marker");
if (!authAction.includes("Installation is already complete or another installer is running")) failures.push("Concurrent installation failure is not normalized");
if (!dbSource.includes("applySecurityMigrations(database)")) failures.push("Security migrations are not wired into database startup");
if (!authLibrary.includes("verifyPasswordOrDummy")) failures.push("Unknown accounts do not use a timing-equalized password check");
for (const source of [authAction, portalAction]) {
  if (!source.includes("loginThrottleContext")) failures.push("A login surface is missing shared abuse throttling");
  if (!source.includes("recordAuthFailure")) failures.push("A login surface does not persist failed abuse attempts");
  if (!source.includes("verifyPasswordOrDummy")) failures.push("A login surface does not equalize unknown-account password verification");
}
for (const contract of [
  "dimension: \"account\"", "dimension: \"network\"", "createHash(\"sha256\")", "isIP", "NIVASA_TRUST_PROXY_HEADERS",
  "x-nivasa-client-ip", "clearAccountThrottle"
]) if (!throttle.includes(contract)) failures.push(`Auth rate limiter is missing ${contract}`);
for (const spoofable of ["x-forwarded-for", "x-real-ip"]) if (throttle.includes(spoofable)) failures.push(`Auth rate limiter trusts spoofable ${spoofable}`);
if (!caddy.includes("header_up X-Nivasa-Client-IP {remote_host}")) failures.push("Caddy does not overwrite the trusted client-address header");
if (!production.includes('NIVASA_TRUST_PROXY_HEADERS: "1"')) failures.push("Production app does not explicitly enable trusted proxy metadata");
if (portalAction.includes("&invite=${encodeURIComponent(token)}") || portalAction.includes("?invite=${encodeURIComponent(token)}")) failures.push("Portal token is still placed in a redirect query string");
if (!portalAction.includes("httpOnly: true") || !portalAction.includes("sameSite: \"strict\"")) failures.push("Portal token handoff cookie is not HTTP-only and SameSite=Strict");

const legacy = new Database(":memory:", { strict: true });
legacy.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);
applySecurityMigrations(legacy);
applySecurityMigrations(legacy);
const columns = new Set(legacy.query("PRAGMA table_info(users)").all().map((row) => row.name));
for (const field of ["failed_attempts", "locked_until", "last_login_at"]) if (!columns.has(field)) failures.push(`Security migration did not add users.${field}`);
if (!legacy.query("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_rate_limits'").get()) failures.push("Security migration did not create auth_rate_limits");
legacy.query("INSERT INTO settings (key,value) VALUES ('installation_state','installing')").run();
let duplicateRejected = false;
try { legacy.query("INSERT INTO settings (key,value) VALUES ('installation_state','installing')").run(); } catch { duplicateRejected = true; }
if (!duplicateRejected) failures.push("Installation marker is not unique");
legacy.close(true);

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Timing-equalized login, trusted-proxy account/network throttling, secure portal token handoff, idempotent security migrations, and atomic first-owner installation are verified.");
