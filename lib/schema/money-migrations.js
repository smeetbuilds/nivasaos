export const MONEY_COLUMNS = Object.freeze({
  units: ["monthly_rate", "deposit"],
  rentable_spaces: ["monthly_rate", "deposit"],
  leases: ["monthly_rent", "deposit"],
  invoices: ["amount", "amount_paid"],
  billing_policies: ["late_fee_value", "late_fee_cap"],
  payments: ["amount"],
  payment_submissions: ["amount"],
  deposit_transactions: ["amount"],
  service_catalog: ["amount"],
  lease_services: ["custom_amount"],
  commercial_lease_profiles: ["common_area_charge"],
  resident_vertical_profiles: ["payroll_recovery", "employer_paid_amount"],
  hostel_reservations: ["nightly_rate", "tax_amount"],
  inspection_items: ["charge_amount"]
});

export const MONEY_SCALE_CONTRACT_VERSION = "4";
export const MONEY_MINOR_MIRROR_VERSION = "1";
export const MONEY_SCALE_TOLERANCE = 0.000000001;
export const MONEY_MAX_MINOR = 3_000_000_000_000_000;

function validationExpression(prefix, columns) {
  return columns
    .map((column) => `(${prefix}.${column} IS NOT NULL AND (
      ABS(${prefix}.${column} * 100 - ROUND(${prefix}.${column} * 100)) > ${MONEY_SCALE_TOLERANCE}
      OR ABS(ROUND(${prefix}.${column} * 100)) > ${MONEY_MAX_MINOR}
    ))`)
    .join(" OR ");
}

function tableColumns(database, table) {
  return new Set(database.query(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function assertHistoricalScale(database) {
  for (const [table, columns] of Object.entries(MONEY_COLUMNS)) {
    for (const column of columns) {
      const invalid = database.query(
        `SELECT rowid FROM ${table}
         WHERE ${column} IS NOT NULL AND (
           ABS(${column} * 100 - ROUND(${column} * 100)) > $tolerance
           OR ABS(ROUND(${column} * 100)) > $maximum
         ) LIMIT 1`
      ).get({ tolerance: MONEY_SCALE_TOLERANCE, maximum: MONEY_MAX_MINOR });
      if (invalid) throw new Error(`Money migration blocked: ${table}.${column} violates the supported precision or monetary range`);
    }
  }
}

function ensureMinorMirror(database, table, column) {
  const minorColumn = `${column}_minor`;
  if (!tableColumns(database, table).has(minorColumn)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${minorColumn} INTEGER`);
  }

  const prefix = `trg_${table}_${column}_minor`;
  for (const suffix of ["guard_insert", "guard_update", "sync_insert", "sync_update"]) {
    database.exec(`DROP TRIGGER IF EXISTS ${prefix}_${suffix}`);
  }

  database.exec(`UPDATE ${table}
    SET ${minorColumn}=CASE WHEN ${column} IS NULL THEN NULL ELSE CAST(ROUND(${column} * 100) AS INTEGER) END
    WHERE (${column} IS NULL AND ${minorColumn} IS NOT NULL)
       OR (${column} IS NOT NULL AND (${minorColumn} IS NULL OR ${minorColumn}!=CAST(ROUND(${column} * 100) AS INTEGER)))`);

  const inconsistent = database.query(
    `SELECT rowid FROM ${table}
     WHERE (${column} IS NULL AND ${minorColumn} IS NOT NULL)
        OR (${column} IS NOT NULL AND ${minorColumn}!=CAST(ROUND(${column} * 100) AS INTEGER))
     LIMIT 1`
  ).get();
  if (inconsistent) throw new Error(`Money minor-unit mirror failed: ${table}.${minorColumn} is inconsistent`);

  database.exec(`CREATE TRIGGER ${prefix}_guard_insert BEFORE INSERT ON ${table}
    WHEN NEW.${minorColumn} IS NOT NULL AND (
      NEW.${column} IS NULL OR NEW.${minorColumn}!=CAST(ROUND(NEW.${column} * 100) AS INTEGER)
    )
    BEGIN SELECT RAISE(ABORT,'money minor-unit mirror does not match decimal value'); END;`);
  database.exec(`CREATE TRIGGER ${prefix}_guard_update BEFORE UPDATE OF ${minorColumn} ON ${table}
    WHEN (NEW.${column} IS NULL AND NEW.${minorColumn} IS NOT NULL)
      OR (NEW.${column} IS NOT NULL AND (NEW.${minorColumn} IS NULL OR NEW.${minorColumn}!=CAST(ROUND(NEW.${column} * 100) AS INTEGER)))
    BEGIN SELECT RAISE(ABORT,'money minor-unit mirror does not match decimal value'); END;`);
  database.exec(`CREATE TRIGGER ${prefix}_sync_insert AFTER INSERT ON ${table}
    WHEN (NEW.${column} IS NULL AND NEW.${minorColumn} IS NOT NULL)
      OR (NEW.${column} IS NOT NULL AND (NEW.${minorColumn} IS NULL OR NEW.${minorColumn}!=CAST(ROUND(NEW.${column} * 100) AS INTEGER)))
    BEGIN
      UPDATE ${table}
      SET ${minorColumn}=CASE WHEN NEW.${column} IS NULL THEN NULL ELSE CAST(ROUND(NEW.${column} * 100) AS INTEGER) END
      WHERE rowid=NEW.rowid;
    END;`);
  database.exec(`CREATE TRIGGER ${prefix}_sync_update AFTER UPDATE OF ${column} ON ${table}
    WHEN (NEW.${column} IS NULL AND NEW.${minorColumn} IS NOT NULL)
      OR (NEW.${column} IS NOT NULL AND (NEW.${minorColumn} IS NULL OR NEW.${minorColumn}!=CAST(ROUND(NEW.${column} * 100) AS INTEGER)))
    BEGIN
      UPDATE ${table}
      SET ${minorColumn}=CASE WHEN NEW.${column} IS NULL THEN NULL ELSE CAST(ROUND(NEW.${column} * 100) AS INTEGER) END
      WHERE rowid=NEW.rowid;
    END;`);
}

export function applyMoneyMigrations(database) {
  database.transaction(() => {
    const currentContract = String(database.query("SELECT value FROM settings WHERE key='money_scale_contract'").get()?.value || "");
    if (currentContract !== MONEY_SCALE_CONTRACT_VERSION) assertHistoricalScale(database);

    for (const [table, columns] of Object.entries(MONEY_COLUMNS)) {
      const insertName = `trg_${table}_money_scale_insert`;
      const updateName = `trg_${table}_money_scale_update`;
      const expression = validationExpression("NEW", columns);
      database.exec(`DROP TRIGGER IF EXISTS ${insertName}`);
      database.exec(`DROP TRIGGER IF EXISTS ${updateName}`);
      database.exec(`CREATE TRIGGER ${insertName} BEFORE INSERT ON ${table}
        WHEN ${expression}
        BEGIN SELECT RAISE(ABORT,'money values must use no more than two decimal places and remain in the supported range'); END;`);
      database.exec(`CREATE TRIGGER ${updateName} BEFORE UPDATE OF ${columns.join(",")} ON ${table}
        WHEN ${expression}
        BEGIN SELECT RAISE(ABORT,'money values must use no more than two decimal places and remain in the supported range'); END;`);
      for (const column of columns) ensureMinorMirror(database, table, column);
    }

    database.query(
      "INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('money_scale_contract',$version,CURRENT_TIMESTAMP)"
    ).run({ version: MONEY_SCALE_CONTRACT_VERSION });
    database.query(
      "INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('money_minor_mirror_contract',$version,CURRENT_TIMESTAMP)"
    ).run({ version: MONEY_MINOR_MIRROR_VERSION });
  })();
}
