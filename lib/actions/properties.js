import { revalidatePath } from "next/cache";
import { requireRole, requireUser, canAccessProperty } from "@/lib/auth";
import { get, run, scalar, transaction } from "@/lib/db";
import { changedFields, recordAudit } from "@/lib/audit";
import { assertProperty, choice, integer, number, safeRedirect, text } from "@/lib/actions/shared";

const PROPERTY_TYPES = ["boarding_house", "apartment", "rental", "mixed"];
const PROPERTY_STATUSES = ["active", "inactive"];
const UNIT_STATUSES = ["available", "occupied", "maintenance", "inactive"];
const TENANT_STATUSES = ["active", "former", "prospect"];
const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED", "AUD"];

function refreshPropertyViews() {
  ["/properties", "/units", "/tenants", "/leases", "/invoices", "/payments", "/maintenance", "/reports", "/dashboard", "/audit"].forEach(revalidatePath);
}

export async function createPropertyAction(formData) {
  const actor = await requireRole(["owner", "admin"]);
  const values = {
    name: text(formData, "name", true),
    type: choice(formData, "type", PROPERTY_TYPES, "apartment"),
    address: text(formData, "address", true),
    city: text(formData, "city"),
    country: text(formData, "country") || "India",
    currency: choice(formData, "currency", CURRENCIES, "INR")
  };
  const propertyId = transaction(() => {
    const result = run(
      `INSERT INTO properties (name,type,address,city,country,currency)
       VALUES ($name,$type,$address,$city,$country,$currency)`,
      values
    );
    const id = Number(result.lastInsertRowid);
    if (actor.role === "admin") {
      run("INSERT OR IGNORE INTO user_properties (user_id,property_id) VALUES ($userId,$propertyId)", { userId: actor.id, propertyId: id });
    }
    recordAudit({ actor, action: "create", entityType: "property", entityId: id, propertyId: id, summary: `Created property ${values.name}` });
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
  const after = {
    name: text(formData, "name", true),
    type: choice(formData, "type", PROPERTY_TYPES, before.type),
    address: text(formData, "address", true),
    city: text(formData, "city"),
    country: text(formData, "country") || "India",
    currency: choice(formData, "currency", CURRENCIES, before.currency),
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
  const fields = changedFields(before, after, ["name", "type", "address", "city", "country", "currency", "status"]);
  if (!fields.length) safeRedirect("/properties", "No property changes detected");
  transaction(() => {
    run(
      `UPDATE properties SET name=$name,type=$type,address=$address,city=$city,country=$country,currency=$currency,status=$status,updated_at=CURRENT_TIMESTAMP
       WHERE id=$propertyId`,
      { ...after, propertyId }
    );
    recordAudit({ actor, action: "update", entityType: "property", entityId: propertyId, propertyId, summary: `Updated property ${after.name}`, metadata: { fields } });
  });
  refreshPropertyViews();
  safeRedirect("/properties", "Property updated");
}

export async function createUnitAction(formData) {
  const actor = await requireRole(["owner", "admin"]);
  const propertyId = await assertProperty(formData, actor);
  const status = choice(formData, "status", ["available", "maintenance", "inactive"], "available");
  const values = {
    propertyId,
    name: text(formData, "name", true),
    unitType: text(formData, "unitType") || "room",
    floor: text(formData, "floor"),
    capacity: Math.max(1, integer(formData, "capacity", 1)),
    monthlyRate: Math.max(0, number(formData, "monthlyRate")),
    deposit: Math.max(0, number(formData, "deposit")),
    status,
    notes: text(formData, "notes")
  };
  transaction(() => {
    const result = run(
      `INSERT INTO units (property_id,name,unit_type,floor,capacity,monthly_rate,deposit,status,notes)
       VALUES ($propertyId,$name,$unitType,$floor,$capacity,$monthlyRate,$deposit,$status,$notes)`,
      values
    );
    recordAudit({ actor, action: "create", entityType: "unit", entityId: Number(result.lastInsertRowid), propertyId, summary: `Created unit ${values.name}` });
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
  const requestedStatus = choice(formData, "status", UNIT_STATUSES, before.status);
  if (activeLease && requestedStatus !== "occupied") throw new Error("An actively leased unit must remain occupied");
  if (!activeLease && requestedStatus === "occupied") throw new Error("Use a lease to mark a unit occupied");
  const after = {
    name: text(formData, "name", true),
    unit_type: text(formData, "unitType") || "room",
    floor: text(formData, "floor"),
    capacity: Math.max(1, integer(formData, "capacity", 1)),
    monthly_rate: Math.max(0, number(formData, "monthlyRate")),
    deposit: Math.max(0, number(formData, "deposit")),
    status: requestedStatus,
    notes: text(formData, "notes")
  };
  const fields = changedFields(before, after, ["name", "unit_type", "floor", "capacity", "monthly_rate", "deposit", "status", "notes"]);
  if (!fields.length) safeRedirect("/units", "No unit changes detected");
  transaction(() => {
    run(
      `UPDATE units SET name=$name,unit_type=$unit_type,floor=$floor,capacity=$capacity,monthly_rate=$monthly_rate,deposit=$deposit,status=$status,notes=$notes,updated_at=CURRENT_TIMESTAMP
       WHERE id=$unitId`,
      { ...after, unitId }
    );
    recordAudit({ actor, action: "update", entityType: "unit", entityId: unitId, propertyId: before.property_id, summary: `Updated unit ${after.name}`, metadata: { fields } });
  });
  refreshPropertyViews();
  safeRedirect("/units", "Unit updated");
}

export async function createTenantAction(formData) {
  const actor = await requireUser();
  const propertyId = await assertProperty(formData, actor);
  const values = {
    propertyId,
    fullName: text(formData, "fullName", true),
    email: text(formData, "email"),
    phone: text(formData, "phone", true),
    identity: text(formData, "identityNumber"),
    emergency: text(formData, "emergencyContact"),
    address: text(formData, "address"),
    status: choice(formData, "status", TENANT_STATUSES, "active")
  };
  transaction(() => {
    const result = run(
      `INSERT INTO tenants (property_id,full_name,email,phone,identity_number,emergency_contact,address,status)
       VALUES ($propertyId,$fullName,$email,$phone,$identity,$emergency,$address,$status)`,
      values
    );
    recordAudit({ actor, action: "create", entityType: "tenant", entityId: Number(result.lastInsertRowid), propertyId, summary: `Created tenant ${values.fullName}` });
  });
  revalidatePath("/tenants");
  revalidatePath("/audit");
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
  const after = {
    full_name: text(formData, "fullName", true),
    email: text(formData, "email"),
    phone: text(formData, "phone", true),
    identity_number: text(formData, "identityNumber"),
    emergency_contact: text(formData, "emergencyContact"),
    address: text(formData, "address"),
    status
  };
  const fields = changedFields(before, after, ["full_name", "email", "phone", "identity_number", "emergency_contact", "address", "status"]);
  if (!fields.length) safeRedirect("/tenants", "No tenant changes detected");
  transaction(() => {
    run(
      `UPDATE tenants SET full_name=$full_name,email=$email,phone=$phone,identity_number=$identity_number,emergency_contact=$emergency_contact,address=$address,status=$status,updated_at=CURRENT_TIMESTAMP
       WHERE id=$tenantId`,
      { ...after, tenantId }
    );
    recordAudit({ actor, action: "update", entityType: "tenant", entityId: tenantId, propertyId: before.property_id, summary: `Updated tenant ${after.full_name}`, metadata: { fields } });
  });
  revalidatePath("/tenants");
  revalidatePath("/leases");
  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/audit");
  safeRedirect("/tenants", "Tenant updated");
}
