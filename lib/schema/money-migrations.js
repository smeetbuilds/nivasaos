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

function precisionExpression(prefix, columns) {
  return columns
    .map((column) => `(${prefix}.${column} IS NOT NULL AND ROUND(${prefix}.${column},2) != ${prefix}.${column})`)
    .join(" OR ");
}

function assertHistoricalScale(database) {
  for (const [table, columns] of Object.entries(MONEY_COLUMNS)) {
    for (const column of columns) {
      const invalid = database.query(`SELECT rowid FROM ${table} WHERE ${column} IS NOT NULL AND ROUND(${column},2) != ${column} LIMIT 1`).get();
      if (invalid) throw new Error(`Money migration blocked: ${table}.${column} contains a value with more than two decimal places`);
    }
  }
}

export function applyMoneyMigrations(database) {
  database.transaction(() => {
    assertHistoricalScale(database);
    for (const [table, columns] of Object.entries(MONEY_COLUMNS)) {
      const insertName = `trg_${table}_money_scale_insert`;
      const updateName = `trg_${table}_money_scale_update`;
      const expression = precisionExpression("NEW", columns);
      database.exec(`DROP TRIGGER IF EXISTS ${insertName}`);
      database.exec(`DROP TRIGGER IF EXISTS ${updateName}`);
      database.exec(`CREATE TRIGGER ${insertName} BEFORE INSERT ON ${table}
        WHEN ${expression}
        BEGIN SELECT RAISE(ABORT,'money values must use no more than two decimal places'); END;`);
      database.exec(`CREATE TRIGGER ${updateName} BEFORE UPDATE OF ${columns.join(",")} ON ${table}
        WHEN ${expression}
        BEGIN SELECT RAISE(ABORT,'money values must use no more than two decimal places'); END;`);
    }
    database.exec("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('money_scale_contract','2',CURRENT_TIMESTAMP)");
  })();
}
