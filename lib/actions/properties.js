import { revalidatePath } from "next/cache";
import { requireRole, requireUser, canAccessProperty } from "@/lib/auth";
import { get, run, scalar, transaction } from "@/lib/db";
import { changedFields, recordAudit } from "@/lib/audit";
import { assertProperty, choice, integer, number, safeRedirect, text } from "@/lib/actions/shared";
import { moduleById } from "@/lib/modules/catalog";
import { isModuleEnabled } from "@/lib/modules/server";
import { seedPropertyTemplate } from "@/lib/modules/seed";

const PROPERTY_STATUSES = ["active", "inactive"];
const UNIT_STATUSES = ["available", "occupied", "maintenance", "inactive"];
const TENANT_STATUSES = ["active", "former", "prospect"];
const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED", "AUD", "CAD", "SGD"];

function refreshPropertyViews() {
  ["/properties", "/units", "/tenants", "/tenant-portal", "/leases", "/spaces", "/services", "/visitors", "/commercial", "/operations", "/reservations", "/housekeeping", "/invoices", "/payments", "/maintenance", "/reports", "/dashboard", "/modules", "/audit", "/portal", "/portal/profile", "/portal/services", "/portal/visitors", "/portal/requests"].forEach(revalidatePath);
}

export async function createPropertyAction(formData) {
  const actor = await requireRole(["owner", "admin"]);
  const moduleId = text(formData, "moduleId", true);
  if (!isModuleEnabled(moduleId)) throw new Error("Select an enabled operating module");
  const module = moduleById(moduleId);
  const values = {
    name: text(formData, "name", true), type: module.propertyType, moduleId: module.id,
    address: text(formData, "address", true), city: text(formData, "city"), country: text(formData, "country") || "India",
    currency: choice(formData, "currency", CURRENCIES, "INR")
  };
  const propertyId = transaction(() => {
    const result = run(`INSERT INTO properties (name,type,module_id,address,city,country,currency) VALUES ($name,$type,$moduleId,$address,$city,$country,$currency)`, values);
    const id = Number(result.lastInsertRowid);
    if (actor.role === "admin") run("INSERT OR IGNORE INTO user_properties (user_id,property_id) VALUES ($userId,$propertyId)", { userId: actor.id, propertyId: id });
    const defaults = get("SELECT settings_json FROM workspace_modules WHERE module_id=$moduleId", { moduleId: module.id })?.settings_json || "{}";
    run(`INSERT INTO property_operating_configs (property_id,module_id,settings_json,configured_by) VALUES ($propertyId,$moduleId,$settingsJson,$actorId)`, { propertyId: id, moduleId: module.id, settingsJson: defaults, actorId: actor.id });
    const seeded = formData.get("seedTemplate") === "on" ? seedPropertyTemplate({ propertyId: id, moduleId: module.id, actorId: actor.id }) : null;
    recordAudit({ actor, action: "create", entityType: "property", entityId: id, propertyId: id, summary: `Created ${module.shortLabel} property ${values.name}`, metadata: { moduleId: module.id, inheritedOperatingDefaults: true, seeded } });
    return id;
  });
  refreshPropertyViews();
  safeRedirect("/properties", `Property created (#${propertyId})`);
}

export async function updatePropertyAction(formData) {
  const actor = await requireRole(["owner", "admin"]);
  const propertyId = integer(formData, "propertyId");
  if (!propertyId || !canAccessProperty(actor, propertyId)) throw new Error("Property access denied");
  const before = get("SELECT * FROM properties WHERE id=$propertyId", { propertyId });
  if (!before) throw new Error("Property not found");
  const moduleId = text(formData, "moduleId") || before.module_id || "residential";
  if (!isModuleEnabled(moduleId)) throw new Error("Select an enabled operating module");
  const module = moduleById(moduleId);
  if (before.module_id !== module.id) {
    const operationalRows = Number(scalar(
      `SELECT
       (SELECT COUNT(*) FROM units WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM tenants WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM leases WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM invoices WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM payments WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM deposit_transactions WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM maintenance_tickets WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM billing_policies WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM property_module_settings WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM service_catalog WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM visitor_entries WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM property_inspections WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM lease_documents WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM lease_key_transactions WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM notification_log WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM property_operating_configs WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM resident_vertical_profiles WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM module_requests WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM hostel_reservations WHERE property_id=$propertyId)+(SELECT COUNT(*) FROM housekeeping_tasks WHERE property_id=$propertyId)+
       (SELECT COUNT(*) FROM bulk_jobs WHERE property_id=$propertyId)`, { propertyId }
    ) || 0);
    if (operationalRows) throw new Error("Operating module locks after property inventory, configuration, or activity exists");
  }
  const after = {
    name: text(formData, "name", true), type: module.propertyType, module_id: module.id, address: text(formData, "address", true),
    city: text(formData, "city"), country: text(formData, "country") || "India", currency: choice(formData, "currency", CURRENCIES, before.currency),
    status: choice(formData, "status", PROPERTY_STATUSES, before.status)
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
    recordAudit({ actor, action: "update", entityType: "property", entityId: propertyId, propertyId, summary: `Updated property ${after.name}`, metadata: { fields, moduleId: after.module_id } });
  });
  refreshPropertyViews();
  safeRedirect("/properties", "Property updated");
}

export async function createUnitAction(formData) {
  const actor = await requireRole(["owner", "admin"]);
  const propertyId = await assertProperty(formData, actor);
  const property = get("SELECT status,module_id FROM properties WHERE id=$propertyId", { propertyId });
  if (!property || property.status !== "active") throw new Error("Units can only be added to an active property");
  const status = choice(formData, "status", ["available", "maintenance", "inactive"], "available");
  const values = { propertyId, name: text(formData, "name", true), unitType: text(formData, "unitType") || moduleById(property.module_id).terminology.unit, floor: text(formData, "floor"), capacity: Math.max(1, integer(formData, "capacity", 1)), monthlyRate: Math.max(0, number(formData, "monthlyRate")), deposit: Math.max(0, number(formData, "deposit")), status, notes: text(formData, "notes") };
  transaction(() => {
    const result = run(`INSERT INTO units (property_id,name,unit_type,floor,capacity,monthly_rate,deposit,status,notes) VALUES ($propertyId,$name,$unitType,$floor,$capacity,$monthlyRate,$deposit,$status,$notes)`, values);
    recordAudit({ actor, action: "create", entityType: "unit", entityId: Number(result.lastInsertRowid), propertyId, summary: `Created unit ${values.name}`, metadata: { moduleId: property.module_id } });
  });
  refreshPropertyViews();
  safeRedirect("/units", "Unit created");
}

export async function updateUnitAction(formData) {
  const actor = await requireRole(["owner", "admin"]);
  const unitId = integer(formData, "unitId");
  const before = get("SELECT * FROM units WHERE id=$unitId", { unitId });
  if (!before || !canAccessProperty(actor, before.property_id)) throw new Error("Unit access denied");
  const activeLease = Boolean(get("SELECT 1 FROM leases WHERE unit_id=$unitId AND status='active'", { unitId }));
  const activeSpaces = Number(scalar("SELECT COUNT(*) FROM space_allocations sa JOIN rentable_spaces rs ON rs.id=sa.space_id WHERE rs.unit_id=$unitId AND sa.status='active'", { unitId }) || 0);
  const totalSpaces = Number(scalar("SELECT COUNT(*) FROM rentable_spaces WHERE unit_id=$unitId AND status!='inactive'", { unitId }) || 0);
  const requestedStatus = choice(formData, "status", UNIT_STATUSES, before.status);
  if (activeLease && requestedStatus !== "occupied") throw new Error("An actively leased unit must remain occupied");
  if (!activeLease && requestedStatus === "occupied") throw new Error("Use a lease to mark a unit occupied");
  const capacity = Math.max(1, integer(formData, "capacity", 1));
  if (capacity < activeSpaces) throw new Error("Capacity cannot be lower than active space allocations");
  if (capacity < totalSpaces) throw new Error("Archive excess spaces before reducing unit capacity");
  const after = { name: text(formData, "name", true), unit_type: text(formData, "unitType") || "room", floor: text(formData, "floor"), capacity, monthly_rate: Math.max(0, number(formData, "monthlyRate")), deposit: Math.max(0, number(formData, "deposit")), status: requestedStatus, notes: text(formData, "notes") };
  const fields = changedFields(before, after, ["name", "unit_type", "floor", "capacity", "monthly_rate", "deposit", "status", "notes"]);
  if (!fields.length) safeRedirect("/units", "No unit changes detected");
  transaction(() => {
    run(`UPDATE units SET name=$name,unit_type=$unit_type,floor=$floor,capacity=$capacity,monthly_rate=$monthly_rate,deposit=$deposit,status=$status,notes=$notes,updated_at=CURRENT_TIMESTAMP WHERE id=$unitId`, { ...after, unitId });
    recordAudit({ actor, action: "update", entityType: "unit", entityId: unitId, propertyId: before.property_id, summary: `Updated unit ${after.name}`, metadata: { fields } });
  });
  refreshPropertyViews();
  safeRedirect("/units", "Unit updated");
}

export async function createTenantAction(formData) {
  const actor = await requireUser();
  const propertyId = await assertProperty(formData, actor);
  const values = { propertyId, fullName: text(formData, "fullName", true), email: text(formData, "email").toLowerCase(), phone: text(formData, "phone", true), identity: text(formData, "identityNumber"), emergency: text(formData, "emergencyContact"), address: text(formData, "address"), status: choice(formData, "status", TENANT_STATUSES, "active") };
  transaction(() => {
    const result = run(`INSERT INTO tenants (property_id,full_name,email,phone,identity_number,emergency_contact,address,status) VALUES ($propertyId,$fullName,$email,$phone,$identity,$emergency,$address,$status)`, values);
    recordAudit({ actor, action: "create", entityType: "tenant", entityId: Number(result.lastInsertRowid), propertyId, summary: `Created tenant ${values.fullName}` });
  });
  refreshPropertyViews();
  safeRedirect("/tenants", "Tenant added");
}

export async function updateTenantAction(formData) {
  const actor = await requireUser();
  const tenantId = integer(formData, "tenantId");
  const before = get("SELECT * FROM tenants WHERE id=$tenantId", { tenantId });
  if (!before || !canAccessProperty(actor, before.property_id)) throw new Error("Tenant access denied");
  const hasActiveLease = Boolean(get("SELECT 1 FROM lease_tenants lt JOIN leases l ON l.id=lt.lease_id WHERE lt.tenant_id=$tenantId AND l.status='active'", { tenantId }));
  const status = choice(formData, "status", TENANT_STATUSES, before.status);
  if (hasActiveLease && status !== "active") throw new Error("A tenant with an active lease must remain active");
  const account = get("SELECT id,email FROM tenant_accounts WHERE tenant_id=$tenantId", { tenantId });
  const email = text(formData, "email").toLowerCase();
  if (account && !email) throw new Error("Email cannot be removed while tenant portal access exists");
  if (account && email) {
    const conflict = get("SELECT tenant_id FROM tenant_accounts WHERE email=$email AND tenant_id!=$tenantId", { email, tenantId });
    if (conflict) throw new Error("This email already belongs to another tenant portal account");
  }
  const after = { full_name: text(formData, "fullName", true), email, phone: text(formData, "phone", true), identity_number: text(formData, "identityNumber"), emergency_contact: text(formData, "emergencyContact"), address: text(formData, "address"), status };
  const fields = changedFields(before, after, ["full_name", "email", "phone", "identity_number", "emergency_contact", "address", "status"]);
  if (!fields.length) safeRedirect("/tenants", "No tenant changes detected");
  transaction(() => {
    run(`UPDATE tenants SET full_name=$full_name,email=$email,phone=$phone,identity_number=$identity_number,emergency_contact=$emergency_contact,address=$address,status=$status,updated_at=CURRENT_TIMESTAMP WHERE id=$tenantId`, { ...after, tenantId });
    if (account && before.email !== email) {
      run("UPDATE tenant_accounts SET email=$email,updated_at=CURRENT_TIMESTAMP WHERE id=$accountId", { email, accountId: account.id });
      run("DELETE FROM tenant_sessions WHERE account_id=$accountId", { accountId: account.id });
    }
    recordAudit({ actor, action: "update", entityType: "tenant", entityId: tenantId, propertyId: before.property_id, summary: `Updated tenant ${after.full_name}`, metadata: { fields, portalSessionsRevoked: Boolean(account && before.email !== email) } });
  });
  refreshPropertyViews();
  safeRedirect("/tenants", "Tenant updated");
}
