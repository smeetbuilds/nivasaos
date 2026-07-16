export const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','admin','staff')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'apartment' CHECK(type IN ('boarding_house','apartment','rental','mixed')),
  address TEXT NOT NULL,
  city TEXT,
  country TEXT NOT NULL DEFAULT 'India',
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_properties (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, property_id)
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL DEFAULT 'room',
  floor TEXT,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK(capacity > 0),
  monthly_rate REAL NOT NULL DEFAULT 0 CHECK(monthly_rate >= 0),
  deposit REAL NOT NULL DEFAULT 0 CHECK(deposit >= 0),
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','occupied','maintenance','inactive')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(property_id, name)
);

CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  identity_number TEXT,
  emergency_contact TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','former','prospect')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  reference TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date TEXT,
  monthly_rent REAL NOT NULL CHECK(monthly_rent >= 0),
  deposit REAL NOT NULL DEFAULT 0 CHECK(deposit >= 0),
  billing_day INTEGER NOT NULL DEFAULT 1 CHECK(billing_day BETWEEN 1 AND 28),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','ended','cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lease_tenants (
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(lease_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id INTEGER REFERENCES leases(id) ON DELETE SET NULL,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  source_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  number TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 0),
  amount_paid REAL NOT NULL DEFAULT 0 CHECK(amount_paid >= 0),
  rent_period TEXT,
  charge_type TEXT NOT NULL DEFAULT 'manual' CHECK(charge_type IN ('manual','rent','late_fee')),
  status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('draft','issued','part_paid','paid','void')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_policies (
  property_id INTEGER PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  grace_days INTEGER NOT NULL DEFAULT 0 CHECK(grace_days BETWEEN 0 AND 60),
  late_fee_type TEXT NOT NULL DEFAULT 'none' CHECK(late_fee_type IN ('none','flat','percent')),
  late_fee_value REAL NOT NULL DEFAULT 0 CHECK(late_fee_value >= 0),
  late_fee_cap REAL CHECK(late_fee_cap IS NULL OR late_fee_cap >= 0),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  reference TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL CHECK(amount > 0),
  method TEXT NOT NULL DEFAULT 'bank_transfer',
  paid_at TEXT NOT NULL,
  proof_path TEXT,
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenance_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'reported' CHECK(status IN ('reported','in_progress','resolved')),
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  driver TEXT NOT NULL,
  recipient TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared',
  metadata TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  summary TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_units_property ON units(property_id);
CREATE INDEX IF NOT EXISTS idx_tenants_property ON tenants(property_id);
CREATE INDEX IF NOT EXISTS idx_leases_property_status ON leases(property_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_property_due ON invoices(property_id, due_date, status);
CREATE INDEX IF NOT EXISTS idx_invoices_source ON invoices(source_invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_property_date ON payments(property_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_property_status ON maintenance_tickets(property_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_property ON audit_log(property_id, created_at DESC);
`;


export function applyMigrations(database) {
  const invoiceColumns = database.query("PRAGMA table_info(invoices)").all();
  if (!invoiceColumns.some((column) => column.name === "rent_period")) {
    database.exec("ALTER TABLE invoices ADD COLUMN rent_period TEXT");
  }
  if (!invoiceColumns.some((column) => column.name === "charge_type")) {
    database.exec("ALTER TABLE invoices ADD COLUMN charge_type TEXT NOT NULL DEFAULT 'manual' CHECK(charge_type IN ('manual','rent','late_fee'))");
  }
  if (!invoiceColumns.some((column) => column.name === "source_invoice_id")) {
    database.exec("ALTER TABLE invoices ADD COLUMN source_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL");
  }
  database.exec(`
    UPDATE invoices SET charge_type='rent' WHERE rent_period IS NOT NULL AND charge_type='manual';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_active_rent_period
    ON invoices(lease_id, rent_period)
    WHERE lease_id IS NOT NULL AND rent_period IS NOT NULL AND status != 'void';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_active_late_fee_source
    ON invoices(source_invoice_id)
    WHERE source_invoice_id IS NOT NULL AND charge_type='late_fee' AND status != 'void';

    CREATE INDEX IF NOT EXISTS idx_invoices_source ON invoices(source_invoice_id);

    CREATE TABLE IF NOT EXISTS billing_policies (
      property_id INTEGER PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
      grace_days INTEGER NOT NULL DEFAULT 0 CHECK(grace_days BETWEEN 0 AND 60),
      late_fee_type TEXT NOT NULL DEFAULT 'none' CHECK(late_fee_type IN ('none','flat','percent')),
      late_fee_value REAL NOT NULL DEFAULT 0 CHECK(late_fee_value >= 0),
      late_fee_cap REAL CHECK(late_fee_cap IS NULL OR late_fee_cap >= 0),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      summary TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_property ON audit_log(property_id, created_at DESC);
  `);
}
