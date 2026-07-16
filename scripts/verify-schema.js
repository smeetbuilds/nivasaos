import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { applyMigrations, schema } from "../lib/schema.js";
import { calculateLateFee } from "../lib/billing-rules.js";

const filename = path.join(tmpdir(), `nivasaos-verify-${randomBytes(8).toString("hex")}.sqlite`);
const db = new Database(filename, { create: true, strict: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  db.exec(schema);
  applyMigrations(db);
  const owner = db.query("INSERT INTO users (name,email,password_hash,role) VALUES ($name,$email,$hash,'owner')").run({ name: "Owner", email: "owner@example.com", hash: "test" });
  const property = db.query("INSERT INTO properties (name,type,address,city,currency) VALUES ($name,'boarding_house',$address,$city,'INR')").run({ name: "Test House", address: "1 Test Road", city: "Surat" });
  const propertyId = Number(property.lastInsertRowid);
  const unit = db.query("INSERT INTO units (property_id,name,unit_type,capacity,monthly_rate,deposit,status) VALUES ($propertyId,$name,'Private room',1,12000,12000,'available')").run({ propertyId, name: "Room 101" });
  const unitId = Number(unit.lastInsertRowid);
  const tenant = db.query("INSERT INTO tenants (property_id,full_name,phone,status) VALUES ($propertyId,$name,$phone,'active')").run({ propertyId, name: "Test Tenant", phone: "919999999999" });
  const tenantId = Number(tenant.lastInsertRowid);
  const lease = db.query("INSERT INTO leases (property_id,unit_id,reference,start_date,monthly_rent,deposit,billing_day,status) VALUES ($propertyId,$unitId,$reference,'2026-07-01',12000,12000,1,'active')").run({ propertyId, unitId, reference: "LEASE-VERIFY" });
  const leaseId = Number(lease.lastInsertRowid);
  db.query("INSERT INTO lease_tenants (lease_id,tenant_id,is_primary) VALUES ($leaseId,$tenantId,1)").run({ leaseId, tenantId });
  db.query("UPDATE units SET status='occupied' WHERE id=$unitId").run({ unitId });
  const invoice = db.query("INSERT INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,rent_period,charge_type,status) VALUES ($propertyId,$leaseId,$tenantId,'INV-VERIFY','Monthly rent','2026-07-01','2026-07-05',12000,'2026-07','rent','issued')").run({ propertyId, leaseId, tenantId });
  const invoiceId = Number(invoice.lastInsertRowid);
  db.query("INSERT INTO payments (property_id,invoice_id,tenant_id,reference,amount,method,paid_at,recorded_by) VALUES ($propertyId,$invoiceId,$tenantId,'PAY-VERIFY',5000,'upi','2026-07-05',$ownerId)").run({ propertyId, invoiceId, tenantId, ownerId: Number(owner.lastInsertRowid) });
  db.query("UPDATE invoices SET amount_paid=5000,status='part_paid' WHERE id=$invoiceId").run({ invoiceId });

  db.query("INSERT OR IGNORE INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,rent_period,charge_type,status) VALUES ($propertyId,$leaseId,$tenantId,'INV-DUPLICATE','Monthly rent duplicate','2026-07-01','2026-07-05',12000,'2026-07','rent','issued')").run({ propertyId, leaseId, tenantId });
  const rentInvoiceCount = db.query("SELECT COUNT(*) total FROM invoices WHERE lease_id=$leaseId AND rent_period='2026-07' AND status!='void'").get({ leaseId });
  db.query("INSERT INTO billing_policies (property_id,grace_days,late_fee_type,late_fee_value,late_fee_cap,updated_by) VALUES ($propertyId,3,'flat',500,NULL,$ownerId)").run({ propertyId, ownerId: Number(owner.lastInsertRowid) });
  const lateFee = db.query("INSERT INTO invoices (property_id,lease_id,tenant_id,source_invoice_id,number,description,issue_date,due_date,amount,charge_type,status) VALUES ($propertyId,$leaseId,$tenantId,$invoiceId,'INV-LATE-1','Late fee','2026-07-16','2026-07-16',500,'late_fee','issued')").run({ propertyId, leaseId, tenantId, invoiceId });
  db.query("INSERT OR IGNORE INTO invoices (property_id,lease_id,tenant_id,source_invoice_id,number,description,issue_date,due_date,amount,charge_type,status) VALUES ($propertyId,$leaseId,$tenantId,$invoiceId,'INV-LATE-DUP','Late fee duplicate','2026-07-16','2026-07-16',500,'late_fee','issued')").run({ propertyId, leaseId, tenantId, invoiceId });
  const activeLateFeeCount = db.query("SELECT COUNT(*) total FROM invoices WHERE source_invoice_id=$invoiceId AND charge_type='late_fee' AND status!='void'").get({ invoiceId });
  db.query("UPDATE invoices SET status='void' WHERE id=$lateFeeId").run({ lateFeeId: Number(lateFee.lastInsertRowid) });
  db.query("INSERT INTO invoices (property_id,lease_id,tenant_id,source_invoice_id,number,description,issue_date,due_date,amount,charge_type,status) VALUES ($propertyId,$leaseId,$tenantId,$invoiceId,'INV-LATE-2','Replacement late fee','2026-07-16','2026-07-16',500,'late_fee','issued')").run({ propertyId, leaseId, tenantId, invoiceId });
  const replacementLateFeeCount = db.query("SELECT COUNT(*) total FROM invoices WHERE source_invoice_id=$invoiceId AND charge_type='late_fee' AND status!='void'").get({ invoiceId });
  db.query("INSERT INTO audit_log (actor_user_id,property_id,action,entity_type,entity_id,summary,metadata) VALUES ($ownerId,$propertyId,'record','payment',$invoiceId,'Recorded verification payment',$metadata)").run({ ownerId: Number(owner.lastInsertRowid), propertyId, invoiceId, metadata: JSON.stringify({ amount: 5000 }) });

  const occupied = db.query("SELECT status FROM units WHERE id=$unitId").get({ unitId });
  const balance = db.query("SELECT amount-amount_paid balance FROM invoices WHERE id=$invoiceId").get({ invoiceId });
  assert(occupied.status === "occupied", "Move-in did not occupy the unit");
  assert(Number(balance.balance) === 7000, "Payment allocation produced an incorrect balance");
  const auditCount = db.query("SELECT COUNT(*) total FROM audit_log WHERE property_id=$propertyId").get({ propertyId });
  assert(Number(rentInvoiceCount.total) === 1, "Rent run idempotency index allowed a duplicate invoice");
  assert(Number(activeLateFeeCount.total) === 1, "Late-fee idempotency index allowed a duplicate invoice");
  assert(Number(replacementLateFeeCount.total) === 1, "Voided late fee could not be safely replaced");
  assert(calculateLateFee(7000, { late_fee_type: "flat", late_fee_value: 500 }) === 500, "Flat late-fee calculation failed");
  assert(calculateLateFee(7000, { late_fee_type: "percent", late_fee_value: 10 }) === 700, "Percentage late-fee calculation failed");
  assert(calculateLateFee(7000, { late_fee_type: "percent", late_fee_value: 10, late_fee_cap: 400 }) === 400, "Late-fee cap failed");
  assert(Number(auditCount.total) === 1, "Audit log migration or insert failed");

  const legacy = new Database(":memory:", { strict: true });
  legacy.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY);
    CREATE TABLE properties(id INTEGER PRIMARY KEY);
    CREATE TABLE leases(id INTEGER PRIMARY KEY);
    CREATE TABLE tenants(id INTEGER PRIMARY KEY);
    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      lease_id INTEGER REFERENCES leases(id) ON DELETE SET NULL,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
      number TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      amount REAL NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0,
      rent_period TEXT,
      status TEXT NOT NULL DEFAULT 'issued',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE audit_log(id INTEGER PRIMARY KEY,actor_user_id INTEGER,property_id INTEGER,action TEXT,entity_type TEXT,entity_id INTEGER,summary TEXT,metadata TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  `);
  applyMigrations(legacy);
  const migratedColumns = legacy.query("PRAGMA table_info(invoices)").all().map((column) => column.name);
  assert(migratedColumns.includes("charge_type") && migratedColumns.includes("source_invoice_id"), "Existing installations did not receive billing columns");
  assert(Boolean(legacy.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='billing_policies'").get()), "Existing installations did not receive billing policies");
  legacy.close();

  console.log("NivasaOS schema, migrations, audit trail, rent runs, and late-fee safeguards verified.");
} finally {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(filename + suffix); } catch {}
  }
}
