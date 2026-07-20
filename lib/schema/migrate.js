import { schema, applyMigrations } from "../schema.js";
import { applySecurityMigrations } from "./security-migrations.js";
import { applyReleaseMigrations } from "./release-migrations.js";
import { applyLocalizationMigrations } from "./localization-migrations.js";
import { applyMoneyMigrations } from "./money-migrations.js";

export const MIGRATION_PLAN = Object.freeze([
  { id: "000-core-schema-v1", apply: (database) => database.exec(schema) },
  { id: "010-security-contract-v1", apply: applySecurityMigrations },
  { id: "020-legacy-schema-v1", apply: applyMigrations },
  { id: "030-release-contract-v1", apply: applyReleaseMigrations },
  { id: "040-localization-contract-v1", apply: applyLocalizationMigrations },
  { id: "050-money-contract-v4", apply: applyMoneyMigrations }
]);

function validatePlan(plan) {
  const ids = new Set();
  for (const migration of plan) {
    if (!/^[0-9]{3}-[a-z0-9-]+-v[0-9]+$/.test(String(migration?.id || ""))) throw new Error(`Invalid migration id: ${migration?.id || "missing"}`);
    if (ids.has(migration.id)) throw new Error(`Duplicate migration id: ${migration.id}`);
    if (typeof migration.apply !== "function") throw new Error(`Migration ${migration.id} does not provide an apply function`);
    ids.add(migration.id);
  }
}

function ensureLedger(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    application_version TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0)
  )`);
}

export function migrationStatus(database, plan = MIGRATION_PLAN) {
  validatePlan(plan);
  ensureLedger(database);
  const applied = new Map(database.query("SELECT id,application_version,applied_at,duration_ms FROM schema_migrations ORDER BY id").all().map((row) => [row.id, row]));
  return plan.map((migration) => ({ id: migration.id, applied: applied.has(migration.id), ...(applied.get(migration.id) || {}) }));
}

export function migrateDatabase(database, { applicationVersion = "1.1.0", plan = MIGRATION_PLAN, now = () => new Date() } = {}) {
  validatePlan(plan);
  database.exec("PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = ON;");
  ensureLedger(database);
  const applied = new Set(database.query("SELECT id FROM schema_migrations").all().map((row) => row.id));
  const executed = [];

  for (const migration of plan) {
    if (applied.has(migration.id)) continue;
    const startedAt = performance.now();
    migration.apply(database);
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    database.query(
      "INSERT INTO schema_migrations (id,application_version,applied_at,duration_ms) VALUES ($id,$version,$appliedAt,$durationMs)"
    ).run({ id: migration.id, version: applicationVersion, appliedAt: now().toISOString(), durationMs });
    executed.push(migration.id);
  }

  return { executed, status: migrationStatus(database, plan) };
}
