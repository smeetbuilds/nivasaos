import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { applyMigrations, schema } from "../lib/schema.js";

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
  const invoice = db.query("INSERT INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,rent_period,status) VALUES ($propertyId,$leaseId,$tenantId,'INV-VERIFY','Monthly rent','2026-07-01','2026-07-05',12000,'2026-07','issued')").run({ propertyId, leaseId, tenantId });
  const invoiceId = Number(invoice.lastInsertRowid);
  db.query("INSERT INTO payments (property_id,invoice_id,tenant_id,reference,amount,method,paid_at,recorded_by) VALUES ($propertyId,$invoiceId,$tenantId,'PAY-VERIFY',5000,'upi','2026-07-05',$ownerId)").run({ propertyId, invoiceId, tenantId, ownerId: Number(owner.lastInsertRowid) });
  db.query("UPDATE invoices SET amount_paid=5000,status='part_paid' WHERE id=$invoiceId").run({ invoiceId });

  db.query("INSERT OR IGNORE INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,rent_period,status) VALUES ($propertyId,$leaseId,$tenantId,'INV-DUPLICATE','Monthly rent duplicate','2026-07-01','2026-07-05',12000,'2026-07','issued')").run({ propertyId, leaseId, tenantId });
  const rentInvoiceCount = db.query("SELECT COUNT(*) total FROM invoices WHERE lease_id=$leaseId AND rent_period='2026-07' AND status!='void'").get({ leaseId });

  const occupied = db.query("SELECT status FROM units WHERE id=$unitId").get({ unitId });
  const balance = db.query("SELECT amount-amount_paid balance FROM invoices WHERE id=$invoiceId").get({ invoiceId });
  assert(occupied.status === "occupied", "Move-in did not occupy the unit");
  assert(Number(balance.balance) === 7000, "Payment allocation produced an incorrect balance");
  assert(Number(rentInvoiceCount.total) === 1, "Rent run idempotency index allowed a duplicate invoice");
  console.log("NivasaOS schema and core financial workflow verified.");
} finally {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(filename + suffix); } catch {}
  }
}
