import { revalidatePath } from "next/cache";
import { canAccessProperty, requireUser } from "@/lib/auth";
import { get, run, scalar, transaction } from "@/lib/db";
import { changedFields, recordAudit } from "@/lib/audit";
import { assertGlobalPermission } from "@/lib/permission-core";
import { choice, integer, safeRedirect, text } from "@/lib/actions/shared";
import { moduleById } from "@/lib/modules/catalog";
import { isModuleEnabled } from "@/lib/modules/server";

const PROPERTY_STATUSES = ["active", "inactive"];
const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED", "AUD", "CAD", "SGD"];

function refreshPropertyViews() {
  ["/properties", "/units", "/tenants", "/tenant-portal", "/leases", "/spaces", "/services", "/visitors", "/commercial", "/operations", "/reservations", "/housekeeping", "/invoices", "/payments", "/maintenance", "/reports", "/dashboard", "/modules", "/audit", "/portal", "/portal/profile", "/portal/services", "/portal/visitors", "/portal/requests"].forEach(revalidatePath);
}

function moduleDefaults(moduleId) {
  return get("SELECT settings_json FROM workspace_modules WHERE module_id=$moduleId", { moduleId })?.settings_json || "{}";
}

export async function updatePropertyReleaseAction(formData) {
  const actor = await requireUser();
  assertGlobalPermission(actor, "properties.manage");
  const propertyId = integer(formData, "propertyId");
  if (!propertyId || !canAccessProperty(actor, propertyId)) throw new Error("Property access denied");
  const before = get("SELECT * FROM properties WHERE id=$propertyId", { propertyId });
  if (!before) throw new Error("Property not found");
  const moduleId = text(formData, "moduleId") || before.module_id || "residential";
  if (!isModuleEnabled(moduleId)) throw new Error("Select an enabled operating module");
  const module = moduleById(moduleId);
  const moduleChanged = before.module_id !== module.id;
  if (moduleChanged) {
    const operationalRows = Number(scalar(
      `SELECT
       (SELECT COUNT(*) FROM units WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM tenants WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM leases WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM invoices WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM payments WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM deposit_transactions WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM maintenance_tickets WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM billing_policies WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM property_module_settings WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM service_catalog WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM visitor_entries WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM property_inspections WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM lease_documents WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM lease_key_transactions WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM notification_log WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM property_operating_configs WHERE property_id=$propertyId AND is_customized=1)+
       (SELECT COUNT(*) FROM resident_vertical_profiles WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM module_requests WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM hostel_reservations WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM housekeeping_tasks WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM bulk_jobs WHERE property_id=$propertyId)`,
      { propertyId }
    ) || 0);
    if (operationalRows) throw new Error("Operating module locks after property inventory, customized configuration, or activity exists");
  }
  const after = {
    name: text(formData, "name", true), type: module.propertyType, module_id: module.id,
    address: text(formData, "address", true), city: text(formData, "city"), country: text(formData, "country") || "India",
    currency: choice(formData, "currency", CURRENCIES, before.currency), status: choice(formData, "status", PROPERTY_STATUSES, before.status)
  };
  if (before.currency !== after.currency) {
    const financialRows = Number(scalar("SELECT (SELECT COUNT(*) FROM invoices WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM payments WHERE property_id=$propertyId)", { propertyId }) || 0);
    if (financialRows) throw new Error("Currency cannot change after financial records exist");
  }
  if (before.status !== "inactive" && after.status === "inactive") {
    const activeLeases = Number(scalar("SELECT COUNT(*) FROM leases WHERE property_id=$propertyId AND status='active'", { propertyId }) || 0);
    if (activeLeases) throw new Error("End active leases before deactivating this property");
  }
  const fields = changedFields(before, after, ["name", "type", "module_id", "address", "city", "country", "currency", "status"]);
  if (!fields.length) safeRedirect("/properties", "No property changes detected");
  transaction(() => {
    run(`UPDATE properties SET name=$name,type=$type,module_id=$module_id,address=$address,city=$city,country=$country,currency=$currency,status=$status,updated_at=CURRENT_TIMESTAMP WHERE id=$propertyId`, { ...after, propertyId });
    if (moduleChanged) {
      run(
        `INSERT INTO property_operating_configs (property_id,module_id,settings_json,is_customized,configured_by)
         VALUES ($propertyId,$moduleId,$settingsJson,0,$actorId)
         ON CONFLICT(property_id) DO UPDATE SET module_id=excluded.module_id,settings_json=excluded.settings_json,is_customized=0,
         configured_by=excluded.configured_by,configured_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`,
        { propertyId, moduleId: module.id, settingsJson: moduleDefaults(module.id), actorId: actor.id }
      );
    }
    recordAudit({ actor, action: "update", entityType: "property", entityId: propertyId, propertyId, summary: `Updated property ${after.name}`, metadata: { fields, moduleId: after.module_id, operatingDefaultsReset: moduleChanged } });
  });
  refreshPropertyViews();
  safeRedirect("/properties", "Property updated");
}
