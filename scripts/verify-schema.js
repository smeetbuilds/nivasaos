import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { applyMigrations, schema } from "../lib/schema.js";
import { calculateLateFee } from "../lib/billing-rules.js";

const filename = path.join(tmpdir(), `nivasaos-verify-${randomBytes(8).toString("hex")}.sqlite`);
const db = new Database(filename, { create: true, strict: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

try {
  db.exec(schema);
  applyMigrations(db);
  const ownerId = Number(db.query("INSERT INTO users (name,email,password_hash,role) VALUES ('Owner','owner@example.com','test','owner')").run().lastInsertRowid);
  const propertyId = Number(db.query("INSERT INTO properties (name,type,address,city,currency) VALUES ('Test House','boarding_house','1 Test Road','Surat','INR')").run().lastInsertRowid);
  const unitId = Number(db.query("INSERT INTO units (property_id,name,unit_type,capacity,monthly_rate,deposit,status) VALUES ($propertyId,'Room 101','Private room',1,12000,12000,'occupied')").run({ propertyId }).lastInsertRowid);
  const tenantId = Number(db.query("INSERT INTO tenants (property_id,full_name,email,phone,status) VALUES ($propertyId,'Test Tenant','tenant@example.com','919999999999','active')").run({ propertyId }).lastInsertRowid);
  const leaseId = Number(db.query("INSERT INTO leases (property_id,unit_id,reference,start_date,monthly_rent,deposit,billing_day,status) VALUES ($propertyId,$unitId,'LEASE-VERIFY','2026-07-01',12000,12000,1,'active')").run({ propertyId, unitId }).lastInsertRowid);
  db.query("INSERT INTO lease_tenants (lease_id,tenant_id,is_primary) VALUES ($leaseId,$tenantId,1)").run({ leaseId, tenantId });
  const invoiceId = Number(db.query("INSERT INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,rent_period,charge_type,status) VALUES ($propertyId,$leaseId,$tenantId,'INV-VERIFY','Monthly rent','2026-07-01','2026-07-05',12000,'2026-07','rent','issued')").run({ propertyId, leaseId, tenantId }).lastInsertRowid);

  const accountId = Number(db.query("INSERT INTO tenant_accounts (tenant_id,email,status,password_hash,activated_at) VALUES ($tenantId,'tenant@example.com','active','test',CURRENT_TIMESTAMP)").run({ tenantId }).lastInsertRowid);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  db.query("INSERT INTO tenant_invites (account_id,token_hash,purpose,expires_at,created_by) VALUES ($accountId,$tokenHash,'reset','2026-08-01T00:00:00.000Z',$ownerId)").run({ accountId, tokenHash, ownerId });
  db.query("INSERT INTO tenant_sessions (account_id,token_hash,expires_at) VALUES ($accountId,$tokenHash2,'2026-08-01T00:00:00.000Z')").run({ accountId, tokenHash2: createHash("sha256").update(`${token}-session`).digest("hex") });

  const submissionId = Number(db.query("INSERT INTO payment_submissions (property_id,tenant_id,invoice_id,amount,method,paid_at,proof_path) VALUES ($propertyId,$tenantId,$invoiceId,5000,'upi','2026-07-05','proof.png')").run({ propertyId, tenantId, invoiceId }).lastInsertRowid);
  const paymentId = Number(db.query("INSERT INTO payments (property_id,invoice_id,tenant_id,reference,amount,method,paid_at,proof_path,recorded_by) VALUES ($propertyId,$invoiceId,$tenantId,'PAY-VERIFY',5000,'upi','2026-07-05','proof.png',$ownerId)").run({ propertyId, invoiceId, tenantId, ownerId }).lastInsertRowid);
  db.query("UPDATE invoices SET amount_paid=5000,status='part_paid' WHERE id=$invoiceId").run({ invoiceId });
  db.query("UPDATE payment_submissions SET status='approved',payment_id=$paymentId,reviewed_by=$ownerId,reviewed_at=CURRENT_TIMESTAMP WHERE id=$submissionId").run({ paymentId, ownerId, submissionId });

  db.query("INSERT INTO deposit_transactions (property_id,lease_id,tenant_id,reference,transaction_type,amount,method,transacted_at,recorded_by) VALUES ($propertyId,$leaseId,$tenantId,'DEP-IN','received',12000,'bank_transfer','2026-07-01',$ownerId)").run({ propertyId, leaseId, tenantId, ownerId });
  db.query("INSERT INTO deposit_transactions (property_id,lease_id,tenant_id,reference,transaction_type,amount,method,transacted_at,recorded_by) VALUES ($propertyId,$leaseId,$tenantId,'DEP-OUT','refund',2000,'bank_transfer','2026-07-20',$ownerId)").run({ propertyId, leaseId, tenantId, ownerId });
  const held = db.query("SELECT SUM(CASE transaction_type WHEN 'received' THEN amount WHEN 'credit' THEN amount ELSE -amount END) held FROM deposit_transactions WHERE lease_id=$leaseId").get({ leaseId });

  const ticketId = Number(db.query("INSERT INTO maintenance_tickets (property_id,unit_id,tenant_id,title,description,status) VALUES ($propertyId,$unitId,$tenantId,'Leak','Under sink','reported')").run({ propertyId, unitId, tenantId }).lastInsertRowid);
  db.query("INSERT INTO maintenance_comments (ticket_id,actor_tenant_id,message,visibility) VALUES ($ticketId,$tenantId,'Water is still running','tenant')").run({ ticketId, tenantId });
  db.query("INSERT INTO maintenance_comments (ticket_id,actor_user_id,message,visibility) VALUES ($ticketId,$ownerId,'Plumber booked','tenant')").run({ ticketId, ownerId });
  db.query("INSERT INTO audit_log (actor_tenant_id,property_id,action,entity_type,entity_id,summary) VALUES ($tenantId,$propertyId,'create','payment_submission',$submissionId,'Tenant submitted proof')").run({ tenantId, propertyId, submissionId });

  assert(Number(held.held) === 10000, "Deposit held calculation failed");
  assert(db.query("SELECT status FROM payment_submissions WHERE id=$submissionId").get({ submissionId }).status === "approved", "Payment submission approval state failed");
  assert(Number(db.query("SELECT COUNT(*) total FROM maintenance_comments WHERE ticket_id=$ticketId").get({ ticketId }).total) === 2, "Maintenance conversation failed");
  assert(Number(db.query("SELECT COUNT(*) total FROM audit_log WHERE actor_tenant_id=$tenantId").get({ tenantId }).total) === 1, "Tenant audit actor failed");
  assert(calculateLateFee(7000, { late_fee_type: "percent", late_fee_value: 10, late_fee_cap: 400 }) === 400, "Late-fee safeguard regressed");

  const duplicate = db.query("INSERT OR IGNORE INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,rent_period,charge_type,status) VALUES ($propertyId,$leaseId,$tenantId,'INV-DUP','Duplicate','2026-07-01','2026-07-05',12000,'2026-07','rent','issued')").run({ propertyId, leaseId, tenantId });
  assert(Number(duplicate.changes) === 0, "Rent invoice idempotency regressed");

  const tables = ["tenant_accounts", "tenant_sessions", "tenant_invites", "payment_submissions", "deposit_transactions", "maintenance_comments"];
  for (const table of tables) assert(Boolean(db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=$table").get({ table })), `${table} was not created`);
  const legacy = new Database(":memory:", { strict: true });
  legacy.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,email TEXT,password_hash TEXT,role TEXT,status TEXT DEFAULT 'active');
    CREATE TABLE properties(id INTEGER PRIMARY KEY,name TEXT,address TEXT,currency TEXT DEFAULT 'INR',status TEXT DEFAULT 'active');
    CREATE TABLE units(id INTEGER PRIMARY KEY,property_id INTEGER,status TEXT DEFAULT 'available');
    CREATE TABLE tenants(id INTEGER PRIMARY KEY,property_id INTEGER,full_name TEXT,email TEXT,phone TEXT,status TEXT DEFAULT 'active');
    CREATE TABLE leases(id INTEGER PRIMARY KEY,property_id INTEGER,unit_id INTEGER,reference TEXT,start_date TEXT,monthly_rent REAL,deposit REAL,billing_day INTEGER,status TEXT);
    CREATE TABLE lease_tenants(lease_id INTEGER,tenant_id INTEGER,is_primary INTEGER,PRIMARY KEY(lease_id,tenant_id));
    CREATE TABLE invoices(id INTEGER PRIMARY KEY,property_id INTEGER,lease_id INTEGER,tenant_id INTEGER,number TEXT,description TEXT,issue_date TEXT,due_date TEXT,amount REAL,amount_paid REAL DEFAULT 0,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE payments(id INTEGER PRIMARY KEY,property_id INTEGER,invoice_id INTEGER,tenant_id INTEGER,reference TEXT,amount REAL,method TEXT,paid_at TEXT,proof_path TEXT,notes TEXT,recorded_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE maintenance_tickets(id INTEGER PRIMARY KEY,property_id INTEGER,unit_id INTEGER,tenant_id INTEGER,title TEXT,description TEXT,priority TEXT,status TEXT,assigned_to INTEGER,reported_at TEXT DEFAULT CURRENT_TIMESTAMP,resolved_at TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE audit_log(id INTEGER PRIMARY KEY,actor_user_id INTEGER,property_id INTEGER,action TEXT,entity_type TEXT,entity_id INTEGER,summary TEXT,metadata TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE sessions(id INTEGER PRIMARY KEY,user_id INTEGER,token_hash TEXT,expires_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE user_properties(user_id INTEGER,property_id INTEGER,PRIMARY KEY(user_id,property_id));
    CREATE TABLE notification_log(id INTEGER PRIMARY KEY,property_id INTEGER,tenant_id INTEGER,invoice_id INTEGER,driver TEXT,recipient TEXT,message TEXT,status TEXT,metadata TEXT,created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  `);
  legacy.exec(schema);
  applyMigrations(legacy);
  const migratedInvoiceColumns = legacy.query("PRAGMA table_info(invoices)").all().map((column) => column.name);
  const migratedAuditColumns = legacy.query("PRAGMA table_info(audit_log)").all().map((column) => column.name);
  assert(["rent_period", "charge_type", "source_invoice_id"].every((column) => migratedInvoiceColumns.includes(column)), "Legacy invoice migration failed");
  assert(migratedAuditColumns.includes("actor_tenant_id"), "Legacy tenant audit migration failed");
  for (const table of tables) assert(Boolean(legacy.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=$table").get({ table })), `Legacy migration did not create ${table}`);
  legacy.close();

  console.log("NivasaOS schema, legacy migrations, tenant portal, receipts, deposits, proof review, maintenance, and existing financial safeguards verified.");
} finally {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) { try { fs.unlinkSync(filename + suffix); } catch {} }
}
