import { Database } from "bun:sqlite";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MIGRATION_PLAN, migrateDatabase, migrationStatus } from "../lib/schema/migrate.js";

const failures = [];
const root = await fsp.mkdtemp(path.join(tmpdir(), "nivasaos-migrations-"));
try {
  const filename = path.join(root, "database.sqlite");
  const database = new Database(filename, { create: true, strict: true });
  const first = migrateDatabase(database, { applicationVersion: "test", now: () => new Date("2026-07-21T00:00:00.000Z") });
  if (first.executed.length !== MIGRATION_PLAN.length) failures.push(`First migration run applied ${first.executed.length}; expected ${MIGRATION_PLAN.length}`);
  const second = migrateDatabase(database, { applicationVersion: "test" });
  if (second.executed.length !== 0) failures.push("Second migration run was not idempotent");
  const rows = database.query("SELECT id,application_version,applied_at,duration_ms FROM schema_migrations ORDER BY id").all();
  if (rows.length !== MIGRATION_PLAN.length) failures.push("Migration ledger row count does not match the registry");
  if (rows.some((row) => row.application_version !== "test" || !row.applied_at || !Number.isInteger(row.duration_ms))) failures.push("Migration ledger metadata is incomplete");
  const status = migrationStatus(database);
  if (status.some((migration) => !migration.applied)) failures.push("Migration status reports pending migrations after a complete run");
  const unitColumns = new Set(database.query("PRAGMA table_info(units)").all().map((row) => row.name));
  if (!unitColumns.has("monthly_rate_minor") || !unitColumns.has("deposit_minor")) failures.push("Registry did not execute the money mirror migration");
  const quickCheck = database.query("PRAGMA quick_check").get();
  if (!quickCheck || Object.values(quickCheck)[0] !== "ok") failures.push("Migrated database failed SQLite quick_check");
  database.close(true);

  const failureDatabase = new Database(path.join(root, "failure.sqlite"), { create: true, strict: true });
  let failed = false;
  try {
    migrateDatabase(failureDatabase, { plan: [{ id: "900-intentional-failure-v1", apply: () => { throw new Error("intentional migration failure"); } }] });
  } catch { failed = true; }
  if (!failed) failures.push("Migration registry accepted an intentionally failing migration");
  if (Number(failureDatabase.query("SELECT COUNT(*) count FROM schema_migrations").get()?.count || 0) !== 0) failures.push("Failed migration was incorrectly recorded as applied");
  failureDatabase.close(true);

  const duplicateDatabase = new Database(path.join(root, "duplicate.sqlite"), { create: true, strict: true });
  let duplicateRejected = false;
  try { migrateDatabase(duplicateDatabase, { plan: [{ id: "900-duplicate-v1", apply() {} }, { id: "900-duplicate-v1", apply() {} }] }); } catch { duplicateRejected = true; }
  if (!duplicateRejected) failures.push("Duplicate migration ids were accepted");
  duplicateDatabase.close(true);

  const dbSource = fs.readFileSync("lib/db.js", "utf8");
  if (!dbSource.includes('import { migrateDatabase } from "@/lib/schema/migrate"')) failures.push("lib/db.js does not use the central migration registry");
  for (const forbidden of ["applySecurityMigrations", "applyReleaseMigrations", "applyLocalizationMigrations", "applyMoneyMigrations", "db.exec(schema)"]) {
    if (dbSource.includes(forbidden)) failures.push(`lib/db.js still owns migration detail: ${forbidden}`);
  }
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  if (packageJson.scripts?.migrate !== "bun run scripts/migrate.js") failures.push("package.json does not expose the explicit migration command");
} finally {
  await fsp.rm(root, { recursive: true, force: true });
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Central migration registry applied ${MIGRATION_PLAN.length} versioned migrations idempotently, recorded durable ownership, rejected failures and duplicates, and passed SQLite integrity checks.`);
