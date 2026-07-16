import { revalidatePath } from "next/cache";
import { canAccessProperty, requireRole } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { changedFields, recordAudit } from "@/lib/audit";
import { integer, number, safeRedirect, text } from "@/lib/actions/shared";
import { validDate } from "@/lib/actions/finance-common";
import { supportsCapability } from "@/lib/modules/catalog";

function refreshCommercialViews() {
  ["/commercial", "/leases", "/dashboard", "/audit", "/portal", "/portal/lease"].forEach(revalidatePath);
}

function limited(formData, key, max, required = false) {
  const value = text(formData, key, required);
  if (value.length > max) throw new Error(`${key} must be ${max} characters or fewer`);
  return value;
}

function optionalDate(formData, key, label) {
  const value = text(formData, key);
  return value ? validDate(value, label) : null;
}

export async function saveCommercialProfileAction(formData) {
  const actor = await requireRole(["owner", "admin"]);
  const leaseId = integer(formData, "leaseId");
  const tenantId = integer(formData, "tenantId") || null;
  const lease = get(
    `SELECT l.*,p.module_id,p.name property_name,u.name unit_name
     FROM leases l JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id WHERE l.id=$leaseId`,
    { leaseId }
  );
  if (!lease || !canAccessProperty(actor, lease.property_id)) throw new Error("Commercial lease access denied");
  if (!supportsCapability(lease.module_id, "commercialProfiles")) throw new Error("Selected lease is not part of a commercial module");
  if (tenantId && !get("SELECT 1 FROM lease_tenants WHERE lease_id=$leaseId AND tenant_id=$tenantId", { leaseId, tenantId })) throw new Error("Business tenant is not linked to this lease");
  const before = get("SELECT * FROM commercial_lease_profiles WHERE lease_id=$leaseId", { leaseId });
  const after = {
    property_id: lease.property_id,
    lease_id: leaseId,
    tenant_id: tenantId,
    business_name: limited(formData, "businessName", 180, true),
    registration_number: limited(formData, "registrationNumber", 120),
    tax_number: limited(formData, "taxNumber", 120),
    business_activity: limited(formData, "businessActivity", 1200),
    common_area_charge: Math.max(0, number(formData, "commonAreaCharge", 0)),
    escalation_percent: Math.max(0, number(formData, "escalationPercent", 0)),
    escalation_date: optionalDate(formData, "escalationDate", "Escalation date"),
    fitout_end_date: optionalDate(formData, "fitoutEndDate", "Fit-out end date"),
    notice_period_days: Math.min(730, Math.max(0, integer(formData, "noticePeriodDays", 30))),
    notes: limited(formData, "notes", 2500),
    updated_by: actor.id
  };
  const fields = before ? changedFields(before, after, ["tenant_id", "business_name", "registration_number", "tax_number", "business_activity", "common_area_charge", "escalation_percent", "escalation_date", "fitout_end_date", "notice_period_days", "notes"]) : Object.keys(after).filter((key) => !["property_id", "lease_id", "updated_by"].includes(key));
  if (before && !fields.length) safeRedirect("/commercial", "No commercial profile changes detected");
  transaction(() => {
    run(
      `INSERT INTO commercial_lease_profiles (
        property_id,lease_id,tenant_id,business_name,registration_number,tax_number,business_activity,
        common_area_charge,escalation_percent,escalation_date,fitout_end_date,notice_period_days,notes,updated_by
       ) VALUES (
        $property_id,$lease_id,$tenant_id,$business_name,$registration_number,$tax_number,$business_activity,
        $common_area_charge,$escalation_percent,$escalation_date,$fitout_end_date,$notice_period_days,$notes,$updated_by
       ) ON CONFLICT(lease_id) DO UPDATE SET
        tenant_id=excluded.tenant_id,business_name=excluded.business_name,registration_number=excluded.registration_number,
        tax_number=excluded.tax_number,business_activity=excluded.business_activity,common_area_charge=excluded.common_area_charge,
        escalation_percent=excluded.escalation_percent,escalation_date=excluded.escalation_date,fitout_end_date=excluded.fitout_end_date,
        notice_period_days=excluded.notice_period_days,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`,
      after
    );
    const profile = get("SELECT id FROM commercial_lease_profiles WHERE lease_id=$leaseId", { leaseId });
    recordAudit({ actor, action: before ? "update" : "create", entityType: "commercial_lease_profile", entityId: profile.id, propertyId: lease.property_id, summary: `${before ? "Updated" : "Created"} commercial profile for ${lease.reference}`, metadata: { fields, businessName: after.business_name } });
  });
  refreshCommercialViews();
  safeRedirect("/commercial", before ? "Commercial profile updated" : "Commercial profile created");
}
