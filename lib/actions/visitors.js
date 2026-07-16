import { revalidatePath } from "next/cache";
import { canAccessProperty, requireUser } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { choice, integer, safeRedirect, text } from "@/lib/actions/shared";
import { requireTenant } from "@/lib/tenant-auth";
import { supportsCapability } from "@/lib/modules/catalog";

function refreshVisitorViews() {
  ["/visitors", "/dashboard", "/audit", "/portal", "/portal/visitors"].forEach(revalidatePath);
}

function limited(formData, key, max, required = false) {
  const value = text(formData, key, required);
  if (value.length > max) throw new Error(`${key} must be ${max} characters or fewer`);
  return value;
}

function localDateTime(formData, key, required = false) {
  const value = text(formData, key, required);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error(`${key} must be a valid local date and time`);
  return value;
}

function visitorProperty(propertyId) {
  const property = get("SELECT * FROM properties WHERE id=$propertyId", { propertyId: Number(propertyId) });
  if (!property || !supportsCapability(property.module_id, "visitorRegister")) throw new Error("Visitor register is unavailable for this property module");
  return property;
}

export async function createVisitorEntryAction(formData) {
  const actor = await requireUser();
  const propertyId = integer(formData, "propertyId");
  const tenantId = integer(formData, "tenantId");
  const leaseId = integer(formData, "leaseId") || null;
  const property = visitorProperty(propertyId);
  if (!canAccessProperty(actor, propertyId)) throw new Error("Property access denied");
  const tenant = get("SELECT * FROM tenants WHERE id=$tenantId AND property_id=$propertyId", { tenantId, propertyId });
  if (!tenant) throw new Error("Resident does not belong to this property");
  if (leaseId && !get("SELECT 1 FROM leases l JOIN lease_tenants lt ON lt.lease_id=l.id WHERE l.id=$leaseId AND l.property_id=$propertyId AND lt.tenant_id=$tenantId AND l.status='active'", { leaseId, propertyId, tenantId })) throw new Error("Resident is not linked to the selected active lease");
  const status = choice(formData, "status", ["expected", "checked_in"], "expected");
  const expectedAt = localDateTime(formData, "expectedAt", true);
  transaction(() => {
    const inserted = run(
      `INSERT INTO visitor_entries (
        property_id,lease_id,tenant_id,visitor_name,visitor_phone,relationship,purpose,id_reference,
        expected_at,expected_checkout,checked_in_at,status,notes,created_by_user
       ) VALUES (
        $propertyId,$leaseId,$tenantId,$visitorName,$visitorPhone,$relationship,$purpose,$idReference,
        $expectedAt,$expectedCheckout,$checkedInAt,$status,$notes,$createdBy
       )`,
      {
        propertyId,
        leaseId,
        tenantId,
        visitorName: limited(formData, "visitorName", 160, true),
        visitorPhone: limited(formData, "visitorPhone", 40),
        relationship: limited(formData, "relationship", 100),
        purpose: limited(formData, "purpose", 500, true),
        idReference: limited(formData, "idReference", 120),
        expectedAt,
        expectedCheckout: localDateTime(formData, "expectedCheckout"),
        checkedInAt: status === "checked_in" ? expectedAt : null,
        status,
        notes: limited(formData, "notes", 1200),
        createdBy: actor.id
      }
    );
    recordAudit({ actor, action: "create", entityType: "visitor_entry", entityId: Number(inserted.lastInsertRowid), propertyId, summary: `Registered visitor for ${tenant.full_name}`, metadata: { tenantId, leaseId, status } });
  });
  refreshVisitorViews();
  safeRedirect("/visitors", status === "checked_in" ? "Visitor checked in" : "Visitor expected");
}

export async function updateVisitorStatusAction(formData) {
  const actor = await requireUser();
  const visitorId = integer(formData, "visitorId");
  const action = choice(formData, "visitorAction", ["check_in", "check_out", "cancel"]);
  const visitor = get("SELECT * FROM visitor_entries WHERE id=$visitorId", { visitorId });
  if (!visitor || !canAccessProperty(actor, visitor.property_id)) throw new Error("Visitor access denied");
  const transitions = {
    check_in: { from: "expected", to: "checked_in" },
    check_out: { from: "checked_in", to: "checked_out" },
    cancel: { from: "expected", to: "cancelled" }
  };
  const transition = transitions[action];
  if (visitor.status !== transition.from) throw new Error(`Visitor cannot ${action.replace("_", " ")} from ${visitor.status}`);
  transaction(() => {
    const changed = run(
      `UPDATE visitor_entries SET status=$status,
       checked_in_at=CASE WHEN $status='checked_in' THEN CURRENT_TIMESTAMP ELSE checked_in_at END,
       checked_out_at=CASE WHEN $status='checked_out' THEN CURRENT_TIMESTAMP ELSE checked_out_at END,
       updated_at=CURRENT_TIMESTAMP WHERE id=$visitorId AND status=$fromStatus`,
      { status: transition.to, visitorId, fromStatus: transition.from }
    );
    if (Number(changed.changes) !== 1) throw new Error("Visitor status changed in another operation");
    recordAudit({ actor, action: "status", entityType: "visitor_entry", entityId: visitorId, propertyId: visitor.property_id, summary: `Visitor ${transition.to.replace("_", " ")}`, metadata: { tenantId: visitor.tenant_id, from: transition.from, to: transition.to } });
  });
  refreshVisitorViews();
  safeRedirect("/visitors", `Visitor ${transition.to.replace("_", " ")}`);
}

export async function preregisterTenantVisitorAction(formData) {
  const tenant = await requireTenant();
  const property = visitorProperty(tenant.property_id);
  void property;
  const leaseId = integer(formData, "leaseId");
  if (!get("SELECT 1 FROM leases l JOIN lease_tenants lt ON lt.lease_id=l.id WHERE l.id=$leaseId AND lt.tenant_id=$tenantId AND l.property_id=$propertyId AND l.status='active'", { leaseId, tenantId: tenant.tenant_id, propertyId: tenant.property_id })) throw new Error("Select an active linked home");
  const expectedAt = localDateTime(formData, "expectedAt", true);
  transaction(() => {
    const inserted = run(
      `INSERT INTO visitor_entries (
        property_id,lease_id,tenant_id,visitor_name,visitor_phone,relationship,purpose,
        expected_at,expected_checkout,status,notes,created_by_tenant
       ) VALUES (
        $propertyId,$leaseId,$tenantId,$visitorName,$visitorPhone,$relationship,$purpose,
        $expectedAt,$expectedCheckout,'expected',$notes,$tenantId
       )`,
      {
        propertyId: tenant.property_id,
        leaseId,
        tenantId: tenant.tenant_id,
        visitorName: limited(formData, "visitorName", 160, true),
        visitorPhone: limited(formData, "visitorPhone", 40),
        relationship: limited(formData, "relationship", 100),
        purpose: limited(formData, "purpose", 500, true),
        expectedAt,
        expectedCheckout: localDateTime(formData, "expectedCheckout"),
        notes: limited(formData, "notes", 1200)
      }
    );
    recordAudit({ tenantActor: tenant, action: "create", entityType: "visitor_entry", entityId: Number(inserted.lastInsertRowid), propertyId: tenant.property_id, summary: `${tenant.full_name} pre-registered a visitor`, metadata: { leaseId } });
  });
  refreshVisitorViews();
  safeRedirect("/portal/visitors", "Visitor pre-registered");
}

export async function cancelTenantVisitorAction(formData) {
  const tenant = await requireTenant();
  const visitorId = integer(formData, "visitorId");
  const visitor = get("SELECT * FROM visitor_entries WHERE id=$visitorId AND tenant_id=$tenantId", { visitorId, tenantId: tenant.tenant_id });
  if (!visitor || visitor.status !== "expected") throw new Error("Only an expected visitor can be cancelled");
  transaction(() => {
    const changed = run("UPDATE visitor_entries SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=$visitorId AND tenant_id=$tenantId AND status='expected'", { visitorId, tenantId: tenant.tenant_id });
    if (Number(changed.changes) !== 1) throw new Error("Visitor status changed in another operation");
    recordAudit({ tenantActor: tenant, action: "status", entityType: "visitor_entry", entityId: visitorId, propertyId: visitor.property_id, summary: `${tenant.full_name} cancelled a visitor registration` });
  });
  refreshVisitorViews();
  safeRedirect("/portal/visitors", "Visitor registration cancelled");
}
