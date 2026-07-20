import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { schema, applyMigrations } from "../lib/schema.js";
import { applySecurityMigrations } from "../lib/schema/security-migrations.js";
import { applyReleaseMigrations } from "../lib/schema/release-migrations.js";
import { applyLocalizationMigrations } from "../lib/schema/localization-migrations.js";
import { applyMoneyMigrations, MONEY_SCALE_CONTRACT_VERSION } from "../lib/schema/money-migrations.js";

const filename = path.join(tmpdir(), `nivasaos-integration-${randomBytes(8).toString("hex")}.sqlite`);
const db = new Database(filename, { create: true, strict: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const expectFailure = (callback, message) => {
  let failed = false;
  try { callback(); } catch { failed = true; }
  assert(failed, message);
};

function prepareLegacy(database) {
  database.exec(schema);
  applySecurityMigrations(database);
  applyMigrations(database);
  applyReleaseMigrations(database);
  applyLocalizationMigrations(database);
}

try {
  prepareLegacy(db);
  applyMoneyMigrations(db);
  applyMoneyMigrations(db);
  assert(db.query("SELECT value FROM settings WHERE key='timezone'").get()?.value === "UTC", "Legacy workspace did not receive an explicit UTC timezone");
  assert(db.query("SELECT value FROM settings WHERE key='money_scale_contract'").get()?.value === MONEY_SCALE_CONTRACT_VERSION, "Money migration did not persist its current version marker");

  const ownerId = Number(db.query("INSERT INTO users (name,email,password_hash,role) VALUES ('Owner','owner@example.com','test','owner')").run().lastInsertRowid);
  const staffId = Number(db.query("INSERT INTO users (name,email,password_hash,role) VALUES ('Finance Staff','staff@example.com','test','staff')").run().lastInsertRowid);
  const propertyId = Number(db.query("INSERT INTO properties (name,type,module_id,address,city,country,currency) VALUES ('Integration Home','apartment','residential','1 Test Road','Test City','Test Country','USD')").run().lastInsertRowid);
  const otherPropertyId = Number(db.query("INSERT INTO properties (name,type,module_id,address,city,country,currency) VALUES ('Restricted Home','apartment','residential','2 Test Road','Test City','Test Country','USD')").run().lastInsertRowid);
  db.query("INSERT INTO user_properties (user_id,property_id) VALUES ($staffId,$propertyId)").run({ staffId, propertyId });
  for (const permission of ["portfolio.view", "payments.manage", "deposits.manage", "reports.view"]) {
    db.query("INSERT INTO permission_grants (user_id,property_id,permission,allowed,granted_by) VALUES ($staffId,$propertyId,$permission,1,$ownerId)").run({ staffId, propertyId, permission, ownerId });
  }
  db.query("INSERT INTO permission_grants (user_id,property_id,permission,allowed,granted_by) VALUES ($staffId,NULL,'settings.manage',0,$ownerId)").run({ staffId, ownerId });
  expectFailure(
    () => db.query("INSERT INTO permission_grants (user_id,property_id,permission,allowed,granted_by) VALUES ($staffId,NULL,'settings.manage',1,$ownerId)").run({ staffId, ownerId }),
    "Global permission grants are not unique"
  );

  const unitId = Number(db.query("INSERT INTO units (property_id,name,unit_type,capacity,monthly_rate,deposit,status) VALUES ($propertyId,'A-101','Apartment',1,1000,800,'occupied')").run({ propertyId }).lastInsertRowid);
  expectFailure(() => db.query("UPDATE units SET monthly_rate=1000.001 WHERE id=$unitId").run({ unitId }), "Database accepted a money value with more than two decimals");
  expectFailure(() => db.query("UPDATE units SET monthly_rate=0.000000001 WHERE id=$unitId").run({ unitId }), "Database accepted a tiny sub-cent money value");
  const tenantId = Number(db.query("INSERT INTO tenants (property_id,full_name,email,phone,status) VALUES ($propertyId,'Resident','resident@example.com','1000000000','active')").run({ propertyId }).lastInsertRowid);
  const leaseId = Number(db.query("INSERT INTO leases (property_id,unit_id,reference,start_date,monthly_rent,deposit,billing_day,status) VALUES ($propertyId,$unitId,'LEASE-INTEGRATION','2026-07-01',1000,800,1,'active')").run({ propertyId, unitId }).lastInsertRowid);
  db.query("INSERT INTO lease_tenants (lease_id,tenant_id,is_primary) VALUES ($leaseId,$tenantId,1)").run({ leaseId, tenantId });
  const invoiceId = Number(db.query("INSERT INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,rent_period,charge_type,status) VALUES ($propertyId,$leaseId,$tenantId,'INV-INTEGRATION','Rent','2026-07-01','2026-07-05',1000,'2026-07','rent','issued')").run({ propertyId, leaseId, tenantId }).lastInsertRowid);
  const submissionId = Number(db.query("INSERT INTO payment_submissions (property_id,tenant_id,invoice_id,amount,method,paid_at,proof_path) VALUES ($propertyId,$tenantId,$invoiceId,400,'bank_transfer','2026-07-02','proof.png')").run({ propertyId, tenantId, invoiceId }).lastInsertRowid);

  db.transaction(() => {
    const current = db.query("SELECT amount,amount_paid,status FROM invoices WHERE id=$invoiceId").get({ invoiceId });
    assert(current.status === "issued", "Invoice was not issued before approval");
    const paymentId = Number(db.query("INSERT INTO payments (property_id,invoice_id,tenant_id,reference,amount,method,paid_at,proof_path,recorded_by) VALUES ($propertyId,$invoiceId,$tenantId,'PAY-INTEGRATION',400,'bank_transfer','2026-07-02','proof.png',$ownerId)").run({ propertyId, invoiceId, tenantId, ownerId }).lastInsertRowid);
    db.query("UPDATE invoices SET amount_paid=400,status='part_paid' WHERE id=$invoiceId").run({ invoiceId });
    db.query("UPDATE payment_submissions SET status='approved',payment_id=$paymentId,reviewed_by=$ownerId,reviewed_at=CURRENT_TIMESTAMP WHERE id=$submissionId").run({ paymentId, ownerId, submissionId });
  })();
  assert(db.query("SELECT status FROM invoices WHERE id=$invoiceId").get({ invoiceId }).status === "part_paid", "Payment approval did not update invoice state");

  const pendingNoiseInvoiceId = Number(db.query("INSERT INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,charge_type,status) VALUES ($propertyId,$leaseId,$tenantId,'INV-PENDING-NOISE','Pending cent aggregation','2026-07-01','2026-07-05',1,'manual','issued')").run({ propertyId, leaseId, tenantId }).lastInsertRowid);
  db.query("INSERT INTO payment_submissions (property_id,tenant_id,invoice_id,amount,method,paid_at,proof_path) VALUES ($propertyId,$tenantId,$invoiceId,0.10,'bank_transfer','2026-07-02','proof-a.png')").run({ propertyId, tenantId, invoiceId: pendingNoiseInvoiceId });
  db.query("INSERT INTO payment_submissions (property_id,tenant_id,invoice_id,amount,method,paid_at,proof_path) VALUES ($propertyId,$tenantId,$invoiceId,0.20,'bank_transfer','2026-07-02','proof-b.png')").run({ propertyId, tenantId, invoiceId: pendingNoiseInvoiceId });
  const pendingNoiseMinor = Number(db.query("SELECT COALESCE(SUM(CAST(ROUND(amount * 100) AS INTEGER)),0) total FROM payment_submissions WHERE invoice_id=$invoiceId AND status='pending'").get({ invoiceId: pendingNoiseInvoiceId }).total);
  assert(pendingNoiseMinor === 30, "Pending payment submissions did not aggregate 0.10 and 0.20 as exactly 30 cents");

  db.query("INSERT INTO deposit_transactions (property_id,lease_id,tenant_id,reference,transaction_type,amount,method,transacted_at,recorded_by) VALUES ($propertyId,$leaseId,$tenantId,'DEP-RECEIVED','received',800.01,'bank_transfer','2026-07-01',$ownerId)").run({ propertyId, leaseId, tenantId, ownerId });
  db.query("INSERT INTO deposit_transactions (property_id,lease_id,tenant_id,reference,transaction_type,amount,method,transacted_at,recorded_by) VALUES ($propertyId,$leaseId,$tenantId,'DEP-REFUND','refund',100.01,'bank_transfer','2026-07-20',$ownerId)").run({ propertyId, leaseId, tenantId, ownerId });
  const heldMinor = Number(db.query(`SELECT SUM(CASE transaction_type WHEN 'received' THEN CAST(ROUND(amount*100) AS INTEGER) WHEN 'credit' THEN CAST(ROUND(amount*100) AS INTEGER) ELSE -CAST(ROUND(amount*100) AS INTEGER) END) held FROM deposit_transactions WHERE lease_id=$leaseId`).get({ leaseId }).held);
  assert(heldMinor === 70000, "Deposit ledger did not preserve its integer-minor-unit balance");

  const serviceId = Number(db.query("INSERT INTO service_catalog (property_id,name,category,billing_frequency,amount,created_by) VALUES ($propertyId,'Parking','parking','monthly',50,$ownerId)").run({ propertyId, ownerId }).lastInsertRowid);
  const subscriptionId = Number(db.query("INSERT INTO lease_services (property_id,lease_id,tenant_id,service_id,start_date,created_by) VALUES ($propertyId,$leaseId,$tenantId,$serviceId,'2026-07-01',$ownerId)").run({ propertyId, leaseId, tenantId, serviceId, ownerId }).lastInsertRowid);
  const serviceInvoiceId = Number(db.query("INSERT INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,charge_type,status) VALUES ($propertyId,$leaseId,$tenantId,'INV-SERVICE','Parking','2026-07-01','2026-07-05',50,'manual','issued')").run({ propertyId, leaseId, tenantId }).lastInsertRowid);
  db.query("INSERT INTO service_billing_runs (subscription_id,period,invoice_id,created_by) VALUES ($subscriptionId,'2026-07',$invoiceId,$ownerId)").run({ subscriptionId, invoiceId: serviceInvoiceId, ownerId });
  expectFailure(() => db.query("INSERT INTO service_billing_runs (subscription_id,period,invoice_id,created_by) VALUES ($subscriptionId,'2026-07',$invoiceId,$ownerId)").run({ subscriptionId, invoiceId, ownerId }), "Service billing period can be duplicated");

  db.query("INSERT INTO visitor_entries (property_id,lease_id,tenant_id,visitor_name,purpose,expected_at,created_by_user) VALUES ($propertyId,$leaseId,$tenantId,'Visitor','Visit','2026-07-10T10:00',$ownerId)").run({ propertyId, leaseId, tenantId, ownerId });
  expectFailure(() => db.query("INSERT INTO visitor_entries (property_id,tenant_id,visitor_name,purpose,expected_at,created_by_user) VALUES ($otherPropertyId,$tenantId,'Invalid','Visit','2026-07-10T10:00',$ownerId)").run({ otherPropertyId, tenantId, ownerId }), "Visitor relationship trigger accepted a cross-property resident");

  const hostelPropertyId = Number(db.query("INSERT INTO properties (name,type,module_id,address,city,country,currency) VALUES ('Integration Hostel','boarding_house','hostel','3 Test Road','Test City','Test Country','USD')").run().lastInsertRowid);
  const hostelUnitId = Number(db.query("INSERT INTO units (property_id,name,unit_type,capacity,monthly_rate,deposit,status) VALUES ($propertyId,'Dorm 1','Dorm',2,0,0,'available')").run({ propertyId: hostelPropertyId }).lastInsertRowid);
  const spaceId = Number(db.query("INSERT INTO rentable_spaces (property_id,unit_id,code,space_type,status) VALUES ($propertyId,$unitId,'Bed A','bed','available')").run({ propertyId: hostelPropertyId, unitId: hostelUnitId }).lastInsertRowid);
  db.query("INSERT INTO hostel_reservations (property_id,unit_id,space_id,reference,guest_name,arrival_date,departure_date,status,created_by) VALUES ($propertyId,$unitId,$spaceId,'BOOK-ONE','Guest One','2026-07-10','2026-07-12','reserved',$ownerId)").run({ propertyId: hostelPropertyId, unitId: hostelUnitId, spaceId, ownerId });
  expectFailure(() => db.query("INSERT INTO hostel_reservations (property_id,unit_id,space_id,reference,guest_name,arrival_date,departure_date,status,created_by) VALUES ($propertyId,$unitId,$spaceId,'BOOK-TWO','Guest Two','2026-07-11','2026-07-13','reserved',$ownerId)").run({ propertyId: hostelPropertyId, unitId: hostelUnitId, spaceId, ownerId }), "Overlapping hostel reservation was accepted");

  db.query("INSERT INTO audit_log (actor_user_id,property_id,action,entity_type,entity_id,summary) VALUES ($ownerId,$propertyId,'record','payment',$invoiceId,'Approved integration payment')").run({ ownerId, propertyId, invoiceId });
  const permittedInvoices = db.query(`SELECT COUNT(*) total FROM invoices i WHERE i.property_id IN (SELECT up.property_id FROM user_properties up JOIN permission_grants pg ON pg.user_id=up.user_id AND pg.property_id=up.property_id WHERE up.user_id=$staffId AND pg.permission='payments.manage' AND pg.allowed=1)`).get({ staffId });
  assert(Number(permittedInvoices.total) === 3, "Permission-scoped financial read did not isolate the assigned property");
  assert(db.query("PRAGMA integrity_check").get().integrity_check === "ok", "SQLite integrity check failed");

  const residueHistory = new Database(":memory:", { strict: true });
  prepareLegacy(residueHistory);
  const residueProperty = Number(residueHistory.query("INSERT INTO properties (name,type,module_id,address,currency) VALUES ('Residue Money','apartment','residential','1 Residue Road','USD')").run().lastInsertRowid);
  residueHistory.query("INSERT INTO units (property_id,name,capacity,monthly_rate,deposit,status) VALUES ($propertyId,'Residue Unit',1,$amount,0,'available')").run({ propertyId: residueProperty, amount: 0.1 + 0.2 });
  applyMoneyMigrations(residueHistory);
  applyMoneyMigrations(residueHistory);
  assert(residueHistory.query("SELECT value FROM settings WHERE key='money_scale_contract'").get()?.value === MONEY_SCALE_CONTRACT_VERSION, "Tolerant money migration did not persist its version marker");
  residueHistory.close(true);

  const invalidHistory = new Database(":memory:", { strict: true });
  prepareLegacy(invalidHistory);
  const invalidProperty = Number(invalidHistory.query("INSERT INTO properties (name,type,module_id,address,currency) VALUES ('Invalid Money','apartment','residential','1 Invalid Road','USD')").run().lastInsertRowid);
  invalidHistory.query("INSERT INTO units (property_id,name,capacity,monthly_rate,deposit,status) VALUES ($propertyId,'Invalid Unit',1,10.001,0,'available')").run({ propertyId: invalidProperty });
  expectFailure(() => applyMoneyMigrations(invalidHistory), "Money migration accepted historical sub-cent values");
  assert(!invalidHistory.query("SELECT 1 FROM settings WHERE key='money_scale_contract'").get(), "Blocked money migration still recorded the precision contract");
  invalidHistory.close(true);

  console.log("End-to-end SQLite workflow verified: explicit timezone migration, versioned tolerant money preflight, scoped staff access, exact pending-payment and deposit minor-unit aggregation, scale triggers, lease billing, payment approval, services, visitors, reservations, audit, and integrity constraints.");
} finally {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) { try { fs.unlinkSync(filename + suffix); } catch {} }
}
