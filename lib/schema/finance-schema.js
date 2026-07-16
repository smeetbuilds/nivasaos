export const financeSchema = `CREATE TABLE IF NOT EXISTS tenant_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','active','disabled')),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_attempts >= 0),
  locked_until TEXT,
  invited_at TEXT,
  activated_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL DEFAULT 'activate' CHECK(purpose IN ('activate','reset')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

`;
