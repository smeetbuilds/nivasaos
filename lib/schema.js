import { coreSchema } from "@/lib/schema/core-schema";
import { financeSchema } from "@/lib/schema/finance-schema";
import { operationsSchema } from "@/lib/schema/operations-schema";
import { handoverSchema } from "@/lib/schema/handover-schema";

export const schema = `${coreSchema}${financeSchema}${operationsSchema}${handoverSchema}`;

function hasColumn(database, table, column) {
  return database.query(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
}

export function applyMigrations(database) {
  if (!hasColumn(database, "invoices", "rent_period")) {
    database.exec("ALTER TABLE invoices ADD COLUMN rent_period TEXT");
  }
  if (!hasColumn(database, "invoices", "charge_type")) {
    database.exec("ALTER TABLE invoices ADD COLUMN charge_type TEXT NOT NULL DEFAULT 'manual' CHECK(charge_type IN ('manual','rent','late_fee'))");
  }
  if (!hasColumn(database, "invoices", "source_invoice_id")) {
    database.exec("ALTER TABLE invoices ADD COLUMN source_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL");
  }
  if (!hasColumn(database, "audit_log", "actor_tenant_id")) {
    database.exec("ALTER TABLE audit_log ADD COLUMN actor_tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL");
  }

  database.exec(`
    UPDATE invoices SET charge_type='rent' WHERE rent_period IS NOT NULL AND charge_type='manual';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_active_rent_period
    ON invoices(lease_id, rent_period)
    WHERE lease_id IS NOT NULL AND rent_period IS NOT NULL AND status != 'void';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_active_late_fee_source
    ON invoices(source_invoice_id)
    WHERE source_invoice_id IS NOT NULL AND charge_type='late_fee' AND status != 'void';

    CREATE TABLE IF NOT EXISTS billing_policies (
      property_id INTEGER PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
      grace_days INTEGER NOT NULL DEFAULT 0 CHECK(grace_days BETWEEN 0 AND 60),
      late_fee_type TEXT NOT NULL DEFAULT 'none' CHECK(late_fee_type IN ('none','flat','percent')),
      late_fee_value REAL NOT NULL DEFAULT 0 CHECK(late_fee_value >= 0),
      late_fee_cap REAL CHECK(late_fee_cap IS NULL OR late_fee_cap >= 0),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tenant_accounts (
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

    CREATE TABLE IF NOT EXISTS payment_submissions (
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

    CREATE INDEX IF NOT EXISTS idx_tenant_accounts_status ON tenant_accounts(status, email);
    CREATE INDEX IF NOT EXISTS idx_tenant_sessions_account ON tenant_sessions(account_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_tenant_invites_account ON tenant_invites(account_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_payment_submissions_status ON payment_submissions(property_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payment_submissions_tenant ON payment_submissions(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_deposits_lease_date ON deposit_transactions(lease_id, transacted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_maintenance_comments_ticket ON maintenance_comments(ticket_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_invoices_source ON invoices(source_invoice_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_property ON audit_log(property_id, created_at DESC);
  `);
}
