import { revalidatePath } from "next/cache";
import { canAccessProperty, requireRole, requireUser } from "@/lib/auth";
import { all, get, run, scalar, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { today, uid } from "@/lib/format";
import { choice, integer, number, safeRedirect, text } from "@/lib/actions/shared";
import { validDate } from "@/lib/actions/finance-common";
import { requireTenant } from "@/lib/tenant-auth";
import { removeLocalFile, saveLocalDocument } from "@/lib/local-files";

const INSPECTION_TYPES = ["move_in", "periodic", "move_out"];
const CONDITIONS = ["excellent", "good", "fair", "damaged", "missing", "not_applicable"];
const DOCUMENT_TYPES = ["agreement", "inventory", "notice", "inspection", "handover", "receipt", "other"];
const KEY_ACTIONS = ["issued", "returned", "lost", "replaced"];
const ACK_STATEMENT = "I confirm that I received and reviewed this condition report. This acknowledgement records receipt and does not waive any rights or prevent me from adding a note.";

function limited(formData, key, max, required = false) {
  const value = text(formData, key, required);
  if (value.length > max) throw new Error(`${key} must be ${max} characters or fewer`);
  return value;
}

function refreshHandoverViews() {
  ["/handover", "/leases", "/tenant-portal", "/audit", "/portal", "/portal/lease"].forEach(revalidatePath);
}

function accessibleLease(actor, leaseId) {
  const lease = get(
    `SELECT l.*,p.name property_name,p.currency,u.name unit_name
     FROM leases l JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id
     WHERE l.id=$leaseId`,
    { leaseId: Number(leaseId) }
  );
  if (!lease || !canAccessProperty(actor, lease.property_id)) throw new Error("Lease access denied");
  return lease;
}

function accessibleInspection(actor, inspectionId) {
  const inspection = get(
    `SELECT pi.*,l.reference lease_reference,p.currency,u.name unit_name
     FROM property_inspections pi
     JOIN leases l ON l.id=pi.lease_id
     JOIN properties p ON p.id=pi.property_id
     JOIN units u ON u.id=l.unit_id
     WHERE pi.id=$inspectionId`,
    { inspectionId: Number(inspectionId) }
  );
  if (!inspection || !canAccessProperty(actor, inspection.property_id)) throw new Error("Inspection access denied");
  return inspection;
}

export async function createInspectionAction(formData) {
  const actor = await requireUser();
  const leaseId = integer(formData, "leaseId");
  const lease = accessibleLease(actor, leaseId);
  const inspectionType = choice(formData, "inspectionType", INSPECTION_TYPES, "move_in");
  const scheduledFor = validDate(text(formData, "scheduledFor") || today(), "Inspection date");
  const reference = uid("INSP");
  transaction(() => {
    const result = run(
      `INSERT INTO property_inspections (
        property_id,lease_id,reference,inspection_type,scheduled_for,status,summary,
        electricity_meter,water_meter,gas_meter,created_by
       ) VALUES (
        $propertyId,$leaseId,$reference,$inspectionType,$scheduledFor,'draft',$summary,
        $electricity,$water,$gas,$createdBy
       )`,
      {
        propertyId: lease.property_id,
        leaseId,
        reference,
        inspectionType,
        scheduledFor,
        summary: limited(formData, "summary", 4000),
        electricity: limited(formData, "electricityMeter", 120),
        water: limited(formData, "waterMeter", 120),
        gas: limited(formData, "gasMeter", 120),
        createdBy: actor.id
      }
    );
    recordAudit({ actor, action: "create", entityType: "property_inspection", entityId: Number(result.lastInsertRowid), propertyId: lease.property_id, summary: `Created ${inspectionType.replaceAll("_", " ")} inspection ${reference}`, metadata: { leaseId, scheduledFor } });
  });
  refreshHandoverViews();
  safeRedirect("/handover", "Inspection draft created");
}

export async function addInspectionItemAction(formData) {
  const actor = await requireUser();
  const inspectionId = integer(formData, "inspectionId");
  const inspection = accessibleInspection(actor, inspectionId);
  if (inspection.status !== "draft") throw new Error("Shared inspections cannot be changed");
  const chargeAmount = number(formData, "chargeAmount", 0);
  if (chargeAmount < 0) throw new Error("Assessed charge cannot be negative");
  const area = limited(formData, "area", 120, true);
  const itemName = limited(formData, "itemName", 180, true);
  const condition = choice(formData, "condition", CONDITIONS, "good");
  if (chargeAmount > 0 && !["damaged", "missing"].includes(condition)) throw new Error("Assessed charges require a damaged or missing condition");
  transaction(() => {
    const result = run(
      `INSERT INTO inspection_items (inspection_id,area,item_name,condition,notes,charge_amount,created_by)
       VALUES ($inspectionId,$area,$itemName,$condition,$notes,$chargeAmount,$createdBy)`,
      { inspectionId, area, itemName, condition, notes: limited(formData, "notes", 2500), chargeAmount, createdBy: actor.id }
    );
    run("UPDATE property_inspections SET updated_at=CURRENT_TIMESTAMP WHERE id=$inspectionId", { inspectionId });
    recordAudit({ actor, action: "create", entityType: "inspection_item", entityId: Number(result.lastInsertRowid), propertyId: inspection.property_id, summary: `Added ${area} · ${itemName} to ${inspection.reference}`, metadata: { inspectionId, condition, chargeAmount } });
  });
  refreshHandoverViews();
  safeRedirect("/handover", "Inspection item added");
}

export async function shareInspectionAction(formData) {
  const actor = await requireUser();
  const inspectionId = integer(formData, "inspectionId");
  const inspection = accessibleInspection(actor, inspectionId);
  if (inspection.status !== "draft") throw new Error("Only draft inspections can be shared");
  const items = Number(scalar("SELECT COUNT(*) FROM inspection_items WHERE inspection_id=$inspectionId", { inspectionId }) || 0);
  if (!items) throw new Error("Add at least one condition item before sharing");
  transaction(() => {
    run(
      `UPDATE property_inspections SET status='shared',shared_at=COALESCE(shared_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
       WHERE id=$inspectionId`,
      { inspectionId }
    );
    recordAudit({ actor, action: "status", entityType: "property_inspection", entityId: inspectionId, propertyId: inspection.property_id, summary: `Shared inspection ${inspection.reference} with tenants`, metadata: { items } });
  });
  refreshHandoverViews();
  safeRedirect("/handover", "Inspection shared with linked tenants");
}

export async function acknowledgeInspectionAction(formData) {
  const tenant = await requireTenant();
  const inspectionId = integer(formData, "inspectionId");
  const inspection = get(
    `SELECT pi.* FROM property_inspections pi
     JOIN lease_tenants lt ON lt.lease_id=pi.lease_id
     WHERE pi.id=$inspectionId AND lt.tenant_id=$tenantId AND pi.status IN ('shared','acknowledged','completed')`,
    { inspectionId, tenantId: tenant.tenant_id }
  );
  if (!inspection) throw new Error("Inspection is not available for acknowledgement");
  transaction(() => {
    if (get("SELECT 1 FROM inspection_acknowledgements WHERE inspection_id=$inspectionId AND tenant_id=$tenantId", { inspectionId, tenantId: tenant.tenant_id })) {
      throw new Error("Inspection was already acknowledged");
    }
    run(
      `INSERT INTO inspection_acknowledgements (inspection_id,tenant_id,statement,tenant_note,acknowledged_at)
       VALUES ($inspectionId,$tenantId,$statement,$tenantNote,CURRENT_TIMESTAMP)`,
      { inspectionId, tenantId: tenant.tenant_id, statement: ACK_STATEMENT, tenantNote: limited(formData, "tenantNote", 2000) }
    );
    const totalTenants = Number(scalar("SELECT COUNT(*) FROM lease_tenants WHERE lease_id=$leaseId", { leaseId: inspection.lease_id }) || 0);
    const acknowledgements = Number(scalar("SELECT COUNT(*) FROM inspection_acknowledgements WHERE inspection_id=$inspectionId", { inspectionId }) || 0);
    run(
      "UPDATE property_inspections SET status=CASE WHEN status='completed' THEN 'completed' ELSE $status END,updated_at=CURRENT_TIMESTAMP WHERE id=$inspectionId",
      { status: acknowledgements >= totalTenants ? "acknowledged" : "shared", inspectionId }
    );
    recordAudit({ tenantActor: tenant, action: "status", entityType: "property_inspection", entityId: inspectionId, propertyId: inspection.property_id, summary: `${tenant.full_name} acknowledged inspection ${inspection.reference}`, metadata: { acknowledgements, totalTenants } });
  });
  refreshHandoverViews();
  safeRedirect("/portal/lease", "Condition report acknowledged");
}

export async function completeInspectionAction(formData) {
  const actor = await requireUser();
  const inspectionId = integer(formData, "inspectionId");
  const inspection = accessibleInspection(actor, inspectionId);
  if (!["shared", "acknowledged"].includes(inspection.status)) throw new Error("Share the inspection before completing it");
  const itemCount = Number(scalar("SELECT COUNT(*) FROM inspection_items WHERE inspection_id=$inspectionId", { inspectionId }) || 0);
  if (!itemCount) throw new Error("Inspection has no condition items");
  const assessedCharge = Number(scalar("SELECT COALESCE(SUM(charge_amount),0) FROM inspection_items WHERE inspection_id=$inspectionId", { inspectionId }) || 0);
  const applyDeduction = formData.get("applyDeduction") === "on";
  if (applyDeduction && inspection.inspection_type !== "move_out") throw new Error("Deposit deductions can only be posted from a move-out inspection");
  if (applyDeduction && !["owner", "admin"].includes(actor.role)) throw new Error("Only an owner or admin can post a deposit deduction");

  transaction(() => {
    const current = get("SELECT * FROM property_inspections WHERE id=$inspectionId", { inspectionId });
    if (!current || current.status === "completed") throw new Error("Inspection was already completed");
    let depositTransactionId = current.deposit_transaction_id || null;
    if (applyDeduction && assessedCharge > 0) {
      if (depositTransactionId) throw new Error("A deposit deduction was already linked to this inspection");
      const held = Number(scalar(
        "SELECT COALESCE(SUM(CASE transaction_type WHEN 'received' THEN amount WHEN 'credit' THEN amount ELSE -amount END),0) FROM deposit_transactions WHERE lease_id=$leaseId",
        { leaseId: inspection.lease_id }
      ) || 0);
      if (assessedCharge > held + 0.001) throw new Error("Assessed damage exceeds the deposit currently held");
      const depositReference = uid("DEP");
      const inserted = run(
        `INSERT INTO deposit_transactions (property_id,lease_id,reference,transaction_type,amount,method,transacted_at,notes,recorded_by)
         VALUES ($propertyId,$leaseId,$reference,'debit',$amount,'inspection_adjustment',$date,$notes,$recordedBy)`,
        {
          propertyId: inspection.property_id,
          leaseId: inspection.lease_id,
          reference: depositReference,
          amount: assessedCharge,
          date: today(),
          notes: `Move-out inspection ${inspection.reference} assessed damage`,
          recordedBy: actor.id
        }
      );
      depositTransactionId = Number(inserted.lastInsertRowid);
    }
    run(
      `UPDATE property_inspections SET status='completed',completed_at=CURRENT_TIMESTAMP,
       deposit_transaction_id=$depositTransactionId,updated_at=CURRENT_TIMESTAMP WHERE id=$inspectionId`,
      { depositTransactionId, inspectionId }
    );
    recordAudit({ actor, action: "status", entityType: "property_inspection", entityId: inspectionId, propertyId: inspection.property_id, summary: `Completed inspection ${inspection.reference}`, metadata: { itemCount, assessedCharge, depositTransactionId } });
  });
  refreshHandoverViews();
  safeRedirect("/handover", applyDeduction && assessedCharge > 0 ? "Inspection completed and deposit deduction recorded" : "Inspection completed");
}

export async function uploadLeaseDocumentAction(formData) {
  const actor = await requireUser();
  const leaseId = integer(formData, "leaseId");
  const lease = accessibleLease(actor, leaseId);
  const inspectionId = integer(formData, "inspectionId") || null;
  if (inspectionId) {
    const inspection = accessibleInspection(actor, inspectionId);
    if (Number(inspection.lease_id) !== leaseId) throw new Error("Inspection does not belong to the selected lease");
  }
  const saved = await saveLocalDocument(formData.get("document"));
  try {
    transaction(() => {
      const result = run(
        `INSERT INTO lease_documents (
          property_id,lease_id,inspection_id,title,document_type,visibility,file_path,
          original_name,mime_type,file_size,notes,uploaded_by
         ) VALUES (
          $propertyId,$leaseId,$inspectionId,$title,$documentType,$visibility,$filePath,
          $originalName,$mimeType,$fileSize,$notes,$uploadedBy
         )`,
        {
          propertyId: lease.property_id,
          leaseId,
          inspectionId,
          title: limited(formData, "title", 180, true),
          documentType: choice(formData, "documentType", DOCUMENT_TYPES, "other"),
          visibility: choice(formData, "visibility", ["tenant", "internal"], "tenant"),
          filePath: saved.filename,
          originalName: saved.originalName,
          mimeType: saved.mimeType,
          fileSize: saved.size,
          notes: limited(formData, "notes", 2000),
          uploadedBy: actor.id
        }
      );
      recordAudit({ actor, action: "create", entityType: "lease_document", entityId: Number(result.lastInsertRowid), propertyId: lease.property_id, summary: `Uploaded lease document for ${lease.reference}`, metadata: { leaseId, inspectionId, visibility: text(formData, "visibility") || "tenant" } });
    });
  } catch (error) {
    removeLocalFile(saved.filename);
    throw error;
  }
  refreshHandoverViews();
  safeRedirect("/handover", "Lease document uploaded");
}

export async function archiveLeaseDocumentAction(formData) {
  const actor = await requireRole(["owner", "admin"]);
  const documentId = integer(formData, "documentId");
  const document = get("SELECT * FROM lease_documents WHERE id=$documentId", { documentId });
  if (!document || !canAccessProperty(actor, document.property_id)) throw new Error("Document access denied");
  if (document.archived_at) safeRedirect("/handover", "Document is already archived");
  transaction(() => {
    run("UPDATE lease_documents SET archived_at=CURRENT_TIMESTAMP WHERE id=$documentId", { documentId });
    recordAudit({ actor, action: "status", entityType: "lease_document", entityId: documentId, propertyId: document.property_id, summary: `Archived lease document ${document.title}` });
  });
  refreshHandoverViews();
  safeRedirect("/handover", "Document archived");
}

export async function recordKeyTransactionAction(formData) {
  const actor = await requireUser();
  const leaseId = integer(formData, "leaseId");
  const lease = accessibleLease(actor, leaseId);
  const tenantId = integer(formData, "tenantId") || null;
  if (tenantId && !get("SELECT 1 FROM lease_tenants WHERE lease_id=$leaseId AND tenant_id=$tenantId", { leaseId, tenantId })) throw new Error("Tenant is not linked to this lease");
  const keyType = limited(formData, "keyType", 120, true);
  const quantity = integer(formData, "quantity", 1);
  if (quantity < 1 || quantity > 100) throw new Error("Key quantity must be between 1 and 100");
  const action = choice(formData, "keyAction", KEY_ACTIONS, "issued");
  if (lease.status === "ended" && ["issued", "replaced"].includes(action)) throw new Error("Ended leases cannot receive newly issued or replacement keys");
  const transactedAt = validDate(text(formData, "transactedAt") || today(), "Key transaction date");
  transaction(() => {
    if (["returned", "lost"].includes(action)) {
      const outstanding = Number(scalar(
        `SELECT COALESCE(SUM(CASE action WHEN 'issued' THEN quantity WHEN 'replaced' THEN quantity ELSE -quantity END),0)
         FROM lease_key_transactions WHERE lease_id=$leaseId AND key_type=$keyType`,
        { leaseId, keyType }
      ) || 0);
      if (quantity > outstanding) throw new Error("Key return or loss exceeds the tracked quantity outstanding");
    }
    const reference = uid("KEY");
    const result = run(
      `INSERT INTO lease_key_transactions (property_id,lease_id,tenant_id,reference,key_type,quantity,action,transacted_at,notes,recorded_by)
       VALUES ($propertyId,$leaseId,$tenantId,$reference,$keyType,$quantity,$action,$transactedAt,$notes,$recordedBy)`,
      { propertyId: lease.property_id, leaseId, tenantId, reference, keyType, quantity, action, transactedAt, notes: limited(formData, "notes", 1500), recordedBy: actor.id }
    );
    recordAudit({ actor, action: "record", entityType: "lease_key_transaction", entityId: Number(result.lastInsertRowid), propertyId: lease.property_id, summary: `Recorded ${action} ${keyType} for ${lease.reference}`, metadata: { leaseId, tenantId, quantity } });
  });
  refreshHandoverViews();
  safeRedirect("/handover", "Key transaction recorded");
}
