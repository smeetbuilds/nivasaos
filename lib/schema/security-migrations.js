function hasColumn(database, table, column) {
  return database.query(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
}

export function applySecurityMigrations(database) {
  if (!hasColumn(database, "users", "failed_attempts")) {
    database.exec("ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_attempts >= 0)");
  }
  if (!hasColumn(database, "users", "locked_until")) {
    database.exec("ALTER TABLE users ADD COLUMN locked_until TEXT");
  }
  if (!hasColumn(database, "users", "last_login_at")) {
    database.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");
  }
}
