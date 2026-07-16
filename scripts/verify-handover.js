import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { schema, applyMigrations } from "../lib/schema.js";
import { coreSchema } from "../lib/schema/core-schema.js";
import { financeSchema } from "../lib/schema/finance-schema.js";
import { operationsSchema } from "../lib/schema/operations-schema.js";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const filename = path.join(tmpdir(), `nivasaos-handover-${randomBytes(8).toString("hex")}.sqlite`);
const db = new Database(filename, { create: true, strict: true });

try {
  db.exec(schema);
  applyMigrations(db);
  const ownerId = Number(db.query("INSERT INTO users (name,email,password_hash,role) VALUES ('Owner','owner@handover.test','hash','owner')").run().lastInsertRowid);
  const propertyId = Number(db.query("INSERT INTO properties (name,type,address,currency) VALUES ('Handover House','apartment','1 Test Road','INR')").run().lastInsertRowid);
  const unitId = Number(db.query("INSERT INTO units (property_id,name,capacity,monthly_rate,deposit,status) VALUES ($propertyId,'A-1',1,15000,20000,'occupied')").run({ propertyId }).lastInsertRowid);
  const tenantId = Number(db.query("INSERT INTO tenants (property_id,full_name,email,phone,status) VALUES ($propertyId,'Resident','resident@handover.test','919999999999','active')").run({ propertyId }).lastInsertRowid);
  const leaseId = Number(db.query("INSERT INTO leases (property_id,unit_id,reference,start_date,monthly_rent,deposit,billing_day,status) VALUES ($propertyId,$unitId,'LEASE-HANDOVER','2026-07-01',15000,20000,1,'active')").run({ propertyId, unitId }).lastInsertRowid);
  db.query("INSERT INTO lease_tenants (lease_id,tenant_id,is_primary) VALUES ($leaseId,$tenantId,1)").run({ leaseId, tenantId });
  const depositId = Number(db.query("INSERT INTO deposit_transactions (property_id,lease_id,reference,transaction_type,amount,method,transacted_at,recorded_by) VALUES ($propertyId,$leaseId,'DEP-HANDOVER','received',20000,'bank_transfer','2026-07-01',$ownerId)").run({ propertyId, leaseId, ownerId }).lastInsertRowid);
  void depositId;

  const inspectionId = Number(db.query("INSERT INTO property_inspections (property_id,lease_id,reference,inspection_type,scheduled_for,status,created_by) VALUES ($propertyId,$leaseId,'INSP-HANDOVER','move_out','2026-07-31','shared',$ownerId)").run({ propertyId, leaseId, ownerId }).lastInsertRowid);
  db.query("INSERT INTO inspection_items (inspection_id,area,item_name,condition,notes,charge_amount,created_by) VALUES ($inspectionId,'Bedroom','Wall paint','damaged','Deep marks',1200,$ownerId)").run({ inspectionId, ownerId });
  db.query("INSERT INTO inspection_acknowledgements (inspection_id,tenant_id,statement,tenant_note) VALUES ($inspectionId,$tenantId,'Receipt acknowledged','Marks existed near window')").run({ inspectionId, tenantId });
  const deductionId = Number(db.query("INSERT INTO deposit_transactions (property_id,lease_id,reference,transaction_type,amount,method,transacted_at,notes,recorded_by) VALUES ($propertyId,$leaseId,'DEP-DAMAGE','debit',1200,'inspection_adjustment','2026-07-31','Inspection damage',$ownerId)").run({ propertyId, leaseId, ownerId }).lastInsertRowid);
  db.query("UPDATE property_inspections SET status='completed',completed_at=CURRENT_TIMESTAMP,deposit_transaction_id=$deductionId WHERE id=$inspectionId").run({ deductionId, inspectionId });
  db.query("INSERT INTO lease_documents (property_id,lease_id,inspection_id,title,document_type,visibility,file_path,original_name,mime_type,file_size,uploaded_by) VALUES ($propertyId,$leaseId,$inspectionId,'Move-out report','inspection','tenant','safe.pdf','report.pdf','application/pdf',1200,$ownerId)").run({ propertyId, leaseId, inspectionId, ownerId });
  db.query("INSERT INTO lease_key_transactions (property_id,lease_id,tenant_id,reference,key_type,quantity,action,transacted_at,recorded_by) VALUES ($propertyId,$leaseId,$tenantId,'KEY-ISSUE','Main door',2,'issued','2026-07-01',$ownerId)").run({ propertyId, leaseId, tenantId, ownerId });
  db.query("INSERT INTO lease_key_transactions (property_id,lease_id,tenant_id,reference,key_type,quantity,action,transacted_at,recorded_by) VALUES ($propertyId,$leaseId,$tenantId,'KEY-RETURN','Main door',2,'returned','2026-07-31',$ownerId)").run({ propertyId, leaseId, tenantId, ownerId });

  const inspection = db.query("SELECT status,deposit_transaction_id FROM property_inspections WHERE id=$inspectionId").get({ inspectionId });
  const held = Number(db.query("SELECT SUM(CASE transaction_type WHEN 'received' THEN amount WHEN 'credit' THEN amount ELSE -amount END) held FROM deposit_transactions WHERE lease_id=$leaseId").get({ leaseId }).held);
  const keys = Number(db.query("SELECT SUM(CASE action WHEN 'issued' THEN quantity WHEN 'replaced' THEN quantity ELSE -quantity END) balance FROM lease_key_transactions WHERE lease_id=$leaseId").get({ leaseId }).balance);
  assert(inspection.status === "completed" && Number(inspection.deposit_transaction_id) === deductionId, "Inspection completion did not preserve the linked deposit deduction");
  assert(held === 18800, "Inspection deduction produced an incorrect deposit-held balance");
  assert(keys === 0, "Key issue and return did not reconcile to zero");
  assert(Number(db.query("SELECT COUNT(*) total FROM inspection_acknowledgements WHERE inspection_id=$inspectionId").get({ inspectionId }).total) === 1, "Tenant acknowledgement was not preserved");
  assert(Number(db.query("SELECT COUNT(*) total FROM lease_documents WHERE visibility='tenant'").get().total) === 1, "Tenant-visible document was not created");

  let duplicateLinkBlocked = false;
  try {
    db.query("INSERT INTO property_inspections (property_id,lease_id,reference,inspection_type,scheduled_for,status,deposit_transaction_id,created_by) VALUES ($propertyId,$leaseId,'INSP-DUP','move_out','2026-08-01','completed',$deductionId,$ownerId)").run({ propertyId, leaseId, deductionId, ownerId });
  } catch { duplicateLinkBlocked = true; }
  assert(duplicateLinkBlocked, "One deposit transaction could be linked to multiple inspections");

  const legacy = new Database(":memory:", { strict: true });
  legacy.exec(`${coreSchema}${financeSchema}${operationsSchema}`);
  legacy.exec(schema);
  applyMigrations(legacy);
  for (const table of ["property_inspections", "inspection_items", "inspection_acknowledgements", "lease_documents", "lease_key_transactions"]) {
    assert(Boolean(legacy.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=$table").get({ table })), `v0.7 upgrade did not create ${table}`);
  }
  legacy.close();

  const source = [
    "lib/actions/handover.js",
    "app/(workspace)/handover/page.js",
    "app/portal/(account)/lease/page.js",
    "app/portal/lease-documents/[id]/route.js"
  ].map((file) => fs.readFileSync(file, "utf8")).join("\n");
  for (const contract of [
    "Complete move-out inspection",
    "Key return or loss exceeds",
    "Acknowledgement confirms receipt",
    "deposit_transaction_id",
    "ld.visibility='tenant'",
    "pi.status IN ('shared','acknowledged','completed')",
    "CASE WHEN status='completed' THEN 'completed'"
  ]) assert(source.includes(contract), `Handover contract missing: ${contract}`);

  console.log("Lease documents, inspections, acknowledgements, key reconciliation, move-out safeguards, and v0.7 migration verified.");
} finally {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) { try { fs.unlinkSync(filename + suffix); } catch {} }
}
