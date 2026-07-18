import fs from "node:fs";
import { Database } from "bun:sqlite";
import { applySecurityMigrations } from "../lib/schema/security-migrations.js";

const failures = [];
const auth = fs.readFileSync("lib/actions/auth.js", "utf8");
const schema = fs.readFileSync("lib/schema/core-schema.js", "utf8");
const dbSource = fs.readFileSync("lib/db.js", "utf8");

for (const field of ["failed_attempts", "locked_until", "last_login_at"]) {
  if (!schema.includes(field)) failures.push(`Fresh schema is missing users.${field}`);
  if (!auth.includes(field)) failures.push(`Staff authentication does not use users.${field}`);
}
if (!auth.includes("installation_state")) failures.push("Installation does not use a transactional installation marker");
if (!auth.includes("Installation is already complete or another installer is running")) failures.push("Concurrent installation failure is not normalized");
if (!dbSource.includes("applySecurityMigrations(database)")) failures.push("Security migrations are not wired into database startup");

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
legacy.query("INSERT INTO settings (key,value) VALUES ('installation_state','installing')").run();
let duplicateRejected = false;
try { legacy.query("INSERT INTO settings (key,value) VALUES ('installation_state','installing')").run(); } catch { duplicateRejected = true; }
if (!duplicateRejected) failures.push("Installation marker is not unique");
legacy.close(true);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Staff login lockout, idempotent security migrations, and atomic first-owner installation are verified.");
