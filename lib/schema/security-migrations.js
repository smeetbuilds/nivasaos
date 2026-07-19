function hasColumn(database, table, column) {
  return database.query(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
}

export function applySecurityMigrations(database) {
  database.transaction(() => {
    if (!hasColumn(database, "users", "failed_attempts")) {
      database.exec("ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_attempts >= 0)");
    }
    if (!hasColumn(database, "users", "locked_until")) {
      database.exec("ALTER TABLE users ADD COLUMN locked_until TEXT");
    }
    if (!hasColumn(database, "users", "last_login_at")) {
      database.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");
    }
    database.exec(`
      CREATE TABLE IF NOT EXISTS auth_rate_limits (
        key_hash TEXT PRIMARY KEY,
        realm TEXT NOT NULL,
        dimension TEXT NOT NULL CHECK(dimension IN ('account','network')),
        failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_attempts >= 0),
        window_started TEXT NOT NULL,
        locked_until TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_expiry ON auth_rate_limits(updated_at,locked_until);
    `);
  })();
}
