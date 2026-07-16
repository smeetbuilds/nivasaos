export const operationsSchema = `CREATE TABLE IF NOT EXISTS payment_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  method TEXT NOT NULL DEFAULT 'bank_transfer',
  paid_at TEXT NOT NULL,
  external_reference TEXT,
  proof_path TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  review_note TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deposit_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  reference TEXT NOT NULL UNIQUE,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('received','refund','credit','debit')),
  amount REAL NOT NULL CHECK(amount > 0),
  method TEXT NOT NULL DEFAULT 'bank_transfer',
  transacted_at TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS maintenance_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'tenant' CHECK(visibility IN ('tenant','internal')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(NOT(actor_user_id IS NOT NULL AND actor_tenant_id IS NOT NULL))
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
  actor_tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS idx_tenant_accounts_status ON tenant_accounts(status, email);
CREATE INDEX IF NOT EXISTS idx_tenant_sessions_account ON tenant_sessions(account_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_tenant_invites_account ON tenant_invites(account_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_leases_property_status ON leases(property_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_property_due ON invoices(property_id, due_date, status);
CREATE INDEX IF NOT EXISTS idx_payments_property_date ON payments(property_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_status ON payment_submissions(property_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_tenant ON payment_submissions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_lease_date ON deposit_transactions(lease_id, transacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_property_status ON maintenance_tickets(property_id, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_comments_ticket ON maintenance_comments(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_property ON audit_log(property_id, created_at DESC);
`;
