import { coreSchema } from "@/lib/schema/core-schema";
import { financeSchema } from "@/lib/schema/finance-schema";
import { operationsSchema } from "@/lib/schema/operations-schema";
import { handoverSchema } from "@/lib/schema/handover-schema";
import { moduleSchema } from "@/lib/schema/module-schema";
import { verticalSchema } from "@/lib/schema/vertical-schema";

export const schema = `${coreSchema}${financeSchema}${operationsSchema}${handoverSchema}${moduleSchema}${verticalSchema}`;

function hasColumn(database, table, column) {
  return database.query(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
}

export function applyMigrations(database) {
  if (!hasColumn(database, "invoices", "rent_period")) database.exec("ALTER TABLE invoices ADD COLUMN rent_period TEXT");
  if (!hasColumn(database, "invoices", "charge_type")) database.exec("ALTER TABLE invoices ADD COLUMN charge_type TEXT NOT NULL DEFAULT 'manual' CHECK(charge_type IN ('manual','rent','late_fee'))");
  if (!hasColumn(database, "invoices", "source_invoice_id")) database.exec("ALTER TABLE invoices ADD COLUMN source_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL");
  if (!hasColumn(database, "audit_log", "actor_tenant_id")) database.exec("ALTER TABLE audit_log ADD COLUMN actor_tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL");

  const addedPropertyModule = !hasColumn(database, "properties", "module_id");
  if (addedPropertyModule) {
    database.exec("ALTER TABLE properties ADD COLUMN module_id TEXT NOT NULL DEFAULT 'residential'");
    database.exec(`UPDATE properties SET module_id=CASE WHEN type='boarding_house' THEN 'pg_coliving' ELSE 'residential' END;`);
  } else {
    database.exec("UPDATE properties SET module_id='residential' WHERE module_id IS NULL OR module_id=''");
  }

  database.exec(`
    UPDATE invoices SET charge_type='rent' WHERE rent_period IS NOT NULL AND charge_type='manual';

    INSERT OR IGNORE INTO workspace_modules (module_id,enabled,sort_order) VALUES ('residential',1,10);
    INSERT OR IGNORE INTO workspace_modules (module_id,enabled,sort_order)
    SELECT DISTINCT module_id,1,CASE module_id
      WHEN 'residential' THEN 10 WHEN 'pg_coliving' THEN 20 WHEN 'hostel' THEN 30
      WHEN 'student_housing' THEN 40 WHEN 'staff_housing' THEN 50 WHEN 'commercial' THEN 60 ELSE 100 END
    FROM properties WHERE module_id IS NOT NULL AND module_id!='';
    INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES ('primary_module','residential',CURRENT_TIMESTAMP);

    DROP TRIGGER IF EXISTS trg_properties_module_insert;
    DROP TRIGGER IF EXISTS trg_properties_module_update;
    DROP TRIGGER IF EXISTS trg_properties_module_activity_lock;

    CREATE TRIGGER trg_properties_module_insert
    BEFORE INSERT ON properties
    WHEN NEW.module_id NOT IN ('residential','pg_coliving','hostel','student_housing','staff_housing','commercial')
    BEGIN SELECT RAISE(ABORT,'invalid property module'); END;

    CREATE TRIGGER trg_properties_module_update
    BEFORE UPDATE OF module_id ON properties
    WHEN NEW.module_id NOT IN ('residential','pg_coliving','hostel','student_housing','staff_housing','commercial')
    BEGIN SELECT RAISE(ABORT,'invalid property module'); END;

    CREATE TRIGGER trg_properties_module_activity_lock
    BEFORE UPDATE OF module_id ON properties
    WHEN OLD.module_id != NEW.module_id AND (
      EXISTS (SELECT 1 FROM units WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM tenants WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM leases WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM invoices WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM payments WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM deposit_transactions WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM maintenance_tickets WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM billing_policies WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM property_module_settings WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM service_catalog WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM visitor_entries WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM property_inspections WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM lease_documents WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM lease_key_transactions WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM notification_log WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM property_operating_configs WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM resident_vertical_profiles WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM module_requests WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM hostel_reservations WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM housekeeping_tasks WHERE property_id=OLD.id) OR
      EXISTS (SELECT 1 FROM bulk_jobs WHERE property_id=OLD.id)
    )
    BEGIN SELECT RAISE(ABORT,'property module is locked after configuration or activity'); END;

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
    CREATE INDEX IF NOT EXISTS idx_properties_module ON properties(module_id,status);
  `);
}