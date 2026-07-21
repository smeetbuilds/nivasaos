import fs from "node:fs";
import { Database } from "bun:sqlite";
import { coreSchema } from "../lib/schema/core-schema.js";
import { applySecurityMigrations } from "../lib/schema/security-migrations.js";

const failures = [];
const authAction = fs.readFileSync("lib/actions/auth.js", "utf8");
const portalAction = fs.readFileSync("lib/actions/portal-accounts.js", "utf8");
const sharedAction = fs.readFileSync("lib/actions/shared.js", "utf8");
const authLibrary = fs.readFileSync("lib/auth.js", "utf8");
const throttle = fs.readFileSync("lib/auth-rate-limit.js", "utf8");
const handoff = fs.readFileSync("lib/portal-handoff.js", "utf8");
const schema = fs.readFileSync("lib/schema/core-schema.js", "utf8");
const securityMigration = fs.readFileSync("lib/schema/security-migrations.js", "utf8");
const migrationRegistry = fs.readFileSync("lib/schema/migrate.js", "utf8");
const dbSource = fs.readFileSync("lib/db.js", "utf8");
const caddy = fs.readFileSync("Caddyfile", "utf8");
const production = fs.readFileSync("compose.production.yml", "utf8");

for (const field of ["failed_attempts", "locked_until", "last_login_at"]) {
  if (!schema.includes(field)) failures.push(`Fresh schema is missing users.${field}`);
}
if (!schema.includes("CREATE TABLE IF NOT EXISTS auth_rate_limits")) failures.push("Fresh schema is missing auth_rate_limits");
if (securityMigration.includes("CREATE TABLE IF NOT EXISTS auth_rate_limits")) failures.push("Security migration duplicates the auth_rate_limits schema");
if (!authAction.includes("installation_state")) failures.push("Installation does not use a transactional installation marker");
if (!authAction.includes("Installation is already complete or another installer is running")) failures.push("Concurrent installation failure is not normalized");
if (!dbSource.includes("migrateDatabase(database)")) failures.push("Database startup does not delegate to the central migration registry");
if (!migrationRegistry.includes("applySecurityMigrations")) failures.push("Central migration registry does not include security migrations");
if (!authLibrary.includes("verifyPasswordOrDummy")) failures.push("Unknown accounts do not use a timing-equalized password check");
if (!sharedAction.includes("export function passwordInput")) failures.push("Password input validation is not shared");
for (const source of [authAction, portalAction]) {
  if (!source.includes("passwordInput(formData")) failures.push("A login surface does not use shared password validation");
  if (!source.includes("loginThrottleContext")) failures.push("A login surface is missing shared abuse throttling");
  if (!source.includes("recordAuthFailure")) failures.push("A login surface does not persist failed abuse attempts");
  if (!source.includes("verifyPasswordOrDummy")) failures.push("A login surface does not equalize unknown-account password verification");
  if (!source.includes("legacyLocked")) failures.push("A login surface ignores an outstanding legacy account lock");
  if (!source.includes("retryAfter === 0 && !legacyLocked ? verifyPasswordOrDummy")) failures.push("A blocked login surface still performs password hashing");
}
for (const contract of [
  "dimension: \"account\"", "dimension: \"network\"", "createHash(\"sha256\")", "isIP", "NIVASA_TRUST_PROXY_HEADERS",
  "x-nivasa-client-ip", "clearAccountThrottle", "windowStarted <= nowMs - item.windowMs"
]) if (!throttle.includes(contract)) failures.push(`Auth rate limiter is missing ${contract}`);
if (throttle.includes("resetWindow = expiredLock")) failures.push("Auth rate limiter resets counters when only the lock interval expires");
for (const spoofable of ["x-forwarded-for", "x-real-ip"]) if (throttle.includes(spoofable)) failures.push(`Auth rate limiter trusts spoofable ${spoofable}`);
if (!caddy.includes("header_up X-Nivasa-Client-IP {remote_host}")) failures.push("Caddy does not overwrite the trusted client-address header");
if (!production.includes('NIVASA_TRUST_PROXY_HEADERS: "1"')) failures.push("Production app does not explicitly enable trusted proxy metadata");
if (portalAction.includes("&invite=${encodeURIComponent(token)}") || portalAction.includes("?invite=${encodeURIComponent(token)}")) failures.push("Portal token is still placed in a redirect query string");
for (const contract of ["createHmac", "timingSafeEqual", "portal_handoff_secret", "httpOnly: true", "sameSite: \"strict\""]) {
  if (!handoff.includes(contract)) failures.push(`Portal handoff is missing ${contract}`);
}

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
const legacyColumnsBeforeCore = new Set(legacy.query("PRAGMA table_info(users)").all().map((row) => row.name));
for (const field of ["failed_attempts", "locked_until", "last_login_at"]) {
  if (legacyColumnsBeforeCore.has(field)) failures.push(`Legacy fixture unexpectedly contains users.${field} before core schema`);
}
legacy.exec(coreSchema);
const legacyColumnsAfterCore = new Set(legacy.query("PRAGMA table_info(users)").all().map((row) => row.name));
for (const field of ["failed_attempts", "locked_until", "last_login_at"]) {
  if (legacyColumnsAfterCore.has(field)) failures.push(`coreSchema replaced the preexisting legacy users table instead of preserving IF NOT EXISTS behavior for ${field}`);
}
applySecurityMigrations(legacy);
applySecurityMigrations(legacy);
const columns = new Set(legacy.query("PRAGMA table_info(users)").all().map((row) => row.name));
for (const field of ["failed_attempts", "locked_until", "last_login_at"]) if (!columns.has(field)) failures.push(`Security migration did not add users.${field}`);
if (!legacy.query("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_rate_limits'").get()) failures.push("Core schema did not create auth_rate_limits");
legacy.query("INSERT INTO settings (key,value) VALUES ('installation_state','installing')").run();
let duplicateRejected = false;
try { legacy.query("INSERT INTO settings (key,value) VALUES ('installation_state','installing')").run(); } catch { duplicateRejected = true; }
if (!duplicateRejected) failures.push("Installation marker is not unique");
legacy.close(false);

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Timing-equalized login, retained throttle counters, shared password parsing, trusted-proxy throttling, explicit legacy-schema migration, authenticated portal handoff, centralized migration ownership, single-source schema, and atomic installation are verified.");
