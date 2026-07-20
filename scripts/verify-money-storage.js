import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { schema, applyMigrations } from "../lib/schema.js";
import { applySecurityMigrations } from "../lib/schema/security-migrations.js";
import { applyReleaseMigrations } from "../lib/schema/release-migrations.js";
import { applyLocalizationMigrations } from "../lib/schema/localization-migrations.js";
import {
  applyMoneyMigrations,
  MONEY_COLUMNS,
  MONEY_MAX_MINOR,
  MONEY_MINOR_MIRROR_VERSION,
  MONEY_SCALE_CONTRACT_VERSION
} from "../lib/schema/money-migrations.js";

const filename = path.join(tmpdir(), `nivasaos-money-storage-${randomBytes(8).toString("hex")}.sqlite`);
const db = new Database(filename, { create: true, strict: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const rejects = (callback, message) => {
  let rejected = false;
  try { callback(); } catch { rejected = true; }
  assert(rejected, message);
};

try {
  db.exec(schema);
  applySecurityMigrations(db);
  applyMigrations(db);
  applyReleaseMigrations(db);
  applyLocalizationMigrations(db);

  const propertyId = Number(db.query(
    "INSERT INTO properties (name,type,module_id,address,country,currency) VALUES ('Money Mirror','apartment','residential','1 Test Road','Test Country','USD')"
  ).run().lastInsertRowid);
  const unitId = Number(db.query(
    "INSERT INTO units (property_id,name,capacity,monthly_rate,deposit,status) VALUES ($propertyId,'Unit A',1,123.45,67.89,'available')"
  ).run({ propertyId }).lastInsertRowid);

  applyMoneyMigrations(db);
  applyMoneyMigrations(db);

  assert(db.query("SELECT value FROM settings WHERE key='money_scale_contract'").get()?.value === MONEY_SCALE_CONTRACT_VERSION, "Money scale contract marker is missing");
  assert(db.query("SELECT value FROM settings WHERE key='money_minor_mirror_contract'").get()?.value === MONEY_MINOR_MIRROR_VERSION, "Money minor-unit mirror marker is missing");

  for (const [table, columns] of Object.entries(MONEY_COLUMNS)) {
    const tableColumns = new Set(db.query(`PRAGMA table_info(${table})`).all().map((column) => column.name));
    for (const column of columns) assert(tableColumns.has(`${column}_minor`), `${table}.${column}_minor was not created`);
  }

  let unit = db.query("SELECT monthly_rate,monthly_rate_minor,deposit_minor FROM units WHERE id=$unitId").get({ unitId });
  assert(unit.monthly_rate_minor === 12345 && unit.deposit_minor === 6789, "Historical money values were not backfilled into exact minor units");

  db.query("UPDATE units SET monthly_rate=99.99 WHERE id=$unitId").run({ unitId });
  unit = db.query("SELECT monthly_rate,monthly_rate_minor FROM units WHERE id=$unitId").get({ unitId });
  assert(unit.monthly_rate === 99.99 && unit.monthly_rate_minor === 9999, "Decimal updates did not synchronize the minor-unit mirror");

  rejects(() => db.query("UPDATE units SET monthly_rate_minor=9998 WHERE id=$unitId").run({ unitId }), "Direct minor-unit mismatch was accepted");
  rejects(() => db.query("UPDATE units SET monthly_rate=10.001 WHERE id=$unitId").run({ unitId }), "Sub-cent decimal value was accepted");
  rejects(() => db.query("UPDATE units SET monthly_rate=$amount WHERE id=$unitId").run({ amount: MONEY_MAX_MINOR / 100 + 0.01, unitId }), "Out-of-range money value was accepted");

  console.log("Versioned money migration, exact minor-unit backfill, dual-write synchronization, mismatch rejection, precision rejection, range rejection, and idempotency verified.");
} finally {
  db.close(true);
  for (const suffix of ["", "-wal", "-shm"]) { try { fs.unlinkSync(filename + suffix); } catch {} }
}
