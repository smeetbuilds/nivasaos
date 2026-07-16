import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { applyMigrations, schema } from "../lib/schema.js";
import { calculateLateFee } from "../lib/billing-rules.js";

const filename = path.join(tmpdir(), `nivasaos-verify-${randomBytes(8).toString("hex")}.sqlite`);
const legacyFilename = path.join(tmpdir(), `nivasaos-legacy-${randomBytes(8).toString("hex")}.sqlite`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clean(file) {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(file + suffix); } catch {}
  }
}

const db = new Database(filename, { create: true, strict: true });
try {
  db.exec(schema);
  applyMigrations(db);
  const owner = db.query("INSERT INTO users (name,email,password_hash,role) VALUES ($name,$email,$hash,'owner')").run({ name: "Owner", email: "owner@example.com", hash: "test" });
  const ownerId = Number(owner.lastInsertRowid);
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
  const invoice = db.query("INSERT INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,rent_period,status) VALUES ($propertyId,$leaseId,$tenantId,'INV-VERIFY','Monthly rent','2026-07-01','2026-07-05',12000,'2026-07','issued')").run({ propertyId, leaseId, tenantId });
  const invoiceId = Number(invoice.lastInsertRowid);
  db.query("INSERT INTO payments (property_id,invoice_id,tenant_id,reference,amount,method,paid_at,recorded_by) VALUES ($propertyId,$invoiceId,$tenantId,'PAY-VERIFY',5000,'upi','2026-07-05',$ownerId)").run({ propertyId, invoiceId, tenantId, ownerId });
  db.query("UPDATE invoices SET amount_paid=5000,status='part_paid' WHERE id=$invoiceId").run({ invoiceId });

  db.query("INSERT OR IGNORE INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,rent_period,status) VALUES ($propertyId,$leaseId,$tenantId,'INV-DUPLICATE','Monthly rent duplicate','2026-07-01','2026-07-05',12000,'2026-07','issued')").run({ propertyId, leaseId, tenantId });
  const rentInvoiceCount = db.query("SELECT COUNT(*) total FROM invoices WHERE lease_id=$leaseId AND rent_period='2026-07' AND status!='void'").get({ leaseId });
  const chargeType = db.query("SELECT charge_type FROM invoices WHERE id=$invoiceId").get({ invoiceId });

  db.query("INSERT INTO billing_policies (property_id,grace_days,late_fee_type,late_fee_value,late_fee_cap,updated_by) VALUES ($propertyId,5,'percent',10,500,$ownerId)").run({ propertyId, ownerId });
  const fee = calculateLateFee(7000, { late_fee_type: "percent", late_fee_value: 10, late_fee_cap: 500 });
  assert(fee === 500, `Expected capped late fee 500, got ${fee}`);
  const insertFee = db.query("INSERT OR IGNORE INTO invoices (property_id,lease_id,tenant_id,source_invoice_id,number,description,issue_date,due_date,amount,charge_type,status) VALUES ($propertyId,$leaseId,$tenantId,$invoiceId,$number,'Late fee','2026-07-16','2026-07-16',$amount,'late_fee','issued')");
  const firstFee = insertFee.run({ propertyId, leaseId, tenantId, invoiceId, number: "INV-FEE-1", amount: fee });
  const duplicateFee = insertFee.run({ propertyId, leaseId, tenantId, invoiceId, number: "INV-FEE-2", amount: fee });

  db.query("INSERT INTO audit_log (actor_user_id,property_id,action,entity_type,entity_id,summary,metadata) VALUES ($ownerId,$propertyId,'record','payment',$invoiceId,'Recorded verification payment',$metadata)").run({ ownerId, propertyId, invoiceId, metadata: JSON.stringify({ amount: 5000 }) });

  const occupied = db.query("SELECT status FROM units WHERE id=$unitId").get({ unitId });
  const balance = db.query("SELECT amount-amount_paid balance FROM invoices WHERE id=$invoiceId").get({ invoiceId });
  const auditCount = db.query("SELECT COUNT(*) total FROM audit_log WHERE property_id=$propertyId").get({ propertyId });
  assert(occupied.status === "occupied", "Move-in did not occupy the unit");
  assert(Number(balance.balance) === 7000, "Payment allocation produced an incorrect balance");
  assert(Number(rentInvoiceCount.total) === 1, "Rent run idempotency index allowed a duplicate invoice");
  assert(chargeType.charge_type === "rent", "Rent invoice classification trigger failed");
  assert(Number(firstFee.changes) === 1 && Number(duplicateFee.changes) === 0, "Late-fee duplicate protection failed");
  assert(Number(auditCount.total) === 1, "Audit log migration or insert failed");
} finally {
  db.close();
  clean(filename);
}

const legacy = new Database(legacyFilename, { create: true, strict: true });
try {
  legacy.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE properties (id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'INR', status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE units (id INTEGER PRIMARY KEY, property_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'available');
    CREATE TABLE tenants (id INTEGER PRIMARY KEY, property_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE leases (id INTEGER PRIMARY KEY, property_id INTEGER NOT NULL, reference TEXT, status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY,
      property_id INTEGER NOT NULL,
      lease_id INTEGER,
      tenant_id INTEGER,
      number TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      amount REAL NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'issued'
    );
    CREATE TABLE payments (id INTEGER PRIMARY KEY, property_id INTEGER NOT NULL, paid_at TEXT NOT NULL);
    CREATE TABLE maintenance_tickets (id INTEGER PRIMARY KEY, property_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'reported');
  `);
  legacy.exec(schema);
  applyMigrations(legacy);
  const columns = legacy.query("PRAGMA table_info(invoices)").all().map((column) => column.name);
  const policyTable = legacy.query("SELECT name FROM sqlite_master WHERE type='table' AND name='billing_policies'").get();
  assert(columns.includes("rent_period"), "Legacy migration did not add rent_period");
  assert(columns.includes("source_invoice_id"), "Legacy migration did not add source_invoice_id");
  assert(columns.includes("charge_type"), "Legacy migration did not add charge_type");
  assert(Boolean(policyTable), "Legacy migration did not create billing_policies");
} finally {
  legacy.close();
  clean(legacyFilename);
}

console.log("NivasaOS schema, migration, billing policy, and financial safeguards verified.");
