import { revalidatePath } from "next/cache";
import { canAccessProperty, requireRole, requireUser } from "@/lib/auth";
import { get, run, scalar, transaction } from "@/lib/db";
import { changedFields, recordAudit } from "@/lib/audit";
import { choice, integer, number, safeRedirect, text } from "@/lib/actions/shared";
import { today } from "@/lib/format";
import { supportsCapability } from "@/lib/modules/catalog";

const SPACE_TYPES = ["bed", "bunk", "desk", "parking", "locker", "other"];
const SPACE_STATUSES = ["available", "occupied", "maintenance", "inactive"];
const GENDER_POLICIES = ["any", "male", "female", "family", "custom"];

function refreshSpaceViews() {
  ["/spaces", "/units", "/leases", "/properties", "/dashboard", "/audit", "/portal", "/portal/lease"].forEach(revalidatePath);
}

function limited(formData, key, max, required = false) {
  const value = text(formData, key, required);
  if (value.length > max) throw new Error(`${key} must be ${max} characters or fewer`);
  return value;
}

function accessibleSpace(actor, spaceId) {
  const space = get(
    `SELECT rs.*,u.capacity,u.name unit_name,u.status unit_status,p.module_id,p.name property_name
     FROM rentable_spaces rs JOIN units u ON u.id=rs.unit_id JOIN properties p ON p.id=rs.property_id
     WHERE rs.id=$spaceId`,
    { spaceId: Number(spaceId) }
  );
  if (!space || !canAccessProperty(actor, space.property_id)) throw new Error("Space access denied");
  if (!supportsCapability(space.module_id, "spaceInventory")) throw new Error("This property module does not support space inventory");
  return space;
}

export async function createSpaceAction(formData) {
  const actor = await requireRole(["owner", "admin"]);
  const propertyId = integer(formData, "propertyId");
  const unitId = integer(formData, "unitId");
  const unit = get("SELECT u.*,p.module_id,p.status property_status FROM units u JOIN properties p ON p.id=u.property_id WHERE u.id=$unitId AND u.property_id=$propertyId", { unitId, propertyId });
  if (!unit || !canAccessProperty(actor, propertyId)) throw new Error("Unit access denied");
  if (!supportsCapability(unit.module_id, "spaceInventory")) throw new Error("Selected property does not use bed or space inventory");
  if (unit.property_status !== "active" || unit.status === "inactive") throw new Error("Spaces can only be added to active inventory");
  const currentSpaces = Number(scalar("SELECT COUNT(*) FROM rentable_spaces WHERE unit_id=$unitId AND status!='inactive'", { unitId }) || 0);
  if (currentSpaces >= Number(unit.capacity)) throw new Error("Unit capacity is already fully represented by spaces");
  const values = {
    propertyId,
    unitId,
    code: limited(formData, "code", 120, true),
    spaceType: choice(formData, "spaceType", SPACE_TYPES, "bed"),
    monthlyRate: Math.max(0, number(formData, "monthlyRate", unit.monthly_rate)),
    deposit: Math.max(0, number(formData, "deposit", unit.deposit)),
    genderPolicy: choice(formData, "genderPolicy", GENDER_POLICIES, "any"),
    status: choice(formData, "status", ["available", "maintenance", "inactive"], "available"),
    notes: limited(formData, "notes", 1500)
  };
  transaction(() => {
    const inserted = run(
      `INSERT INTO rentable_spaces (property_id,unit_id,code,space_type,monthly_rate,deposit,gender_policy,status,notes)
       VALUES ($propertyId,$unitId,$code,$spaceType,$monthlyRate,$deposit,$genderPolicy,$status,$notes)`,
      values
    );
    recordAudit({ actor, action: "create", entityType: "rentable_space", entityId: Number(inserted.lastInsertRowid), propertyId, summary: `Created ${values.spaceType} ${values.code}`, metadata: { unitId, status: values.status } });
  });
  refreshSpaceViews();
  safeRedirect("/spaces", "Space created");
}

export async function updateSpaceAction(formData) {
  const actor = await requireRole(["owner", "admin"]);
  const spaceId = integer(formData, "spaceId");
  const before = accessibleSpace(actor, spaceId);
  const activeAllocation = Boolean(get("SELECT 1 FROM space_allocations WHERE space_id=$spaceId AND status='active'", { spaceId }));
  const requestedStatus = choice(formData, "status", SPACE_STATUSES, before.status);
  if (activeAllocation && requestedStatus !== "occupied") throw new Error("An allocated space must remain occupied");
  if (!activeAllocation && requestedStatus === "occupied") throw new Error("Allocate the space to mark it occupied");
  const after = {
    code: limited(formData, "code", 120, true),
    space_type: choice(formData, "spaceType", SPACE_TYPES, before.space_type),
    monthly_rate: Math.max(0, number(formData, "monthlyRate", before.monthly_rate)),
    deposit: Math.max(0, number(formData, "deposit", before.deposit)),
    gender_policy: choice(formData, "genderPolicy", GENDER_POLICIES, before.gender_policy),
    status: requestedStatus,
    notes: limited(formData, "notes", 1500)
  };
  const fields = changedFields(before, after, ["code", "space_type", "monthly_rate", "deposit", "gender_policy", "status", "notes"]);
  if (!fields.length) safeRedirect("/spaces", "No space changes detected");
  transaction(() => {
    run(
      `UPDATE rentable_spaces SET code=$code,space_type=$space_type,monthly_rate=$monthly_rate,deposit=$deposit,
       gender_policy=$gender_policy,status=$status,notes=$notes,updated_at=CURRENT_TIMESTAMP WHERE id=$spaceId`,
      { ...after, spaceId }
    );
    recordAudit({ actor, action: "update", entityType: "rentable_space", entityId: spaceId, propertyId: before.property_id, summary: `Updated space ${after.code}`, metadata: { fields } });
  });
  refreshSpaceViews();
  safeRedirect("/spaces", "Space updated");
}

export async function allocateSpaceAction(formData) {
  const actor = await requireUser();
  const spaceId = integer(formData, "spaceId");
  const leaseId = integer(formData, "leaseId");
  const tenantId = integer(formData, "tenantId");
  const space = accessibleSpace(actor, spaceId);
  if (space.status !== "available") throw new Error("Space is not available");
  const lease = get("SELECT * FROM leases WHERE id=$leaseId AND property_id=$propertyId AND unit_id=$unitId AND status='active'", { leaseId, propertyId: space.property_id, unitId: space.unit_id });
  if (!lease) throw new Error("Select an active lease for the same unit");
  if (!get("SELECT 1 FROM lease_tenants WHERE lease_id=$leaseId AND tenant_id=$tenantId", { leaseId, tenantId })) throw new Error("Tenant is not linked to the selected lease");
  if (get("SELECT 1 FROM space_allocations WHERE lease_id=$leaseId AND tenant_id=$tenantId AND status='active'", { leaseId, tenantId })) throw new Error("Tenant already has an active space allocation for this lease");
  transaction(() => {
    const current = get("SELECT status FROM rentable_spaces WHERE id=$spaceId", { spaceId });
    if (!current || current.status !== "available") throw new Error("Space was allocated by another operation");
    const inserted = run(
      `INSERT INTO space_allocations (property_id,space_id,lease_id,tenant_id,start_date,status,created_by)
       VALUES ($propertyId,$spaceId,$leaseId,$tenantId,$startDate,'active',$createdBy)`,
      { propertyId: space.property_id, spaceId, leaseId, tenantId, startDate: text(formData, "startDate") || today(), createdBy: actor.id }
    );
    run("UPDATE rentable_spaces SET status='occupied',updated_at=CURRENT_TIMESTAMP WHERE id=$spaceId", { spaceId });
    run("UPDATE units SET status='occupied',updated_at=CURRENT_TIMESTAMP WHERE id=$unitId", { unitId: space.unit_id });
    recordAudit({ actor, action: "create", entityType: "space_allocation", entityId: Number(inserted.lastInsertRowid), propertyId: space.property_id, summary: `Allocated ${space.code}`, metadata: { spaceId, leaseId, tenantId } });
  });
  refreshSpaceViews();
  safeRedirect("/spaces", "Space allocated");
}

export async function releaseSpaceAllocationAction(formData) {
  const actor = await requireUser();
  const allocationId = integer(formData, "allocationId");
  const allocation = get(
    `SELECT sa.*,rs.code,rs.unit_id FROM space_allocations sa JOIN rentable_spaces rs ON rs.id=sa.space_id
     WHERE sa.id=$allocationId`,
    { allocationId }
  );
  if (!allocation || allocation.status !== "active" || !canAccessProperty(actor, allocation.property_id)) throw new Error("Active allocation access denied");
  transaction(() => {
    run("UPDATE space_allocations SET status='ended',end_date=$endDate,updated_at=CURRENT_TIMESTAMP WHERE id=$allocationId AND status='active'", { allocationId, endDate: text(formData, "endDate") || today() });
    run("UPDATE rentable_spaces SET status='available',updated_at=CURRENT_TIMESTAMP WHERE id=$spaceId AND status='occupied'", { spaceId: allocation.space_id });
    recordAudit({ actor, action: "end", entityType: "space_allocation", entityId: allocationId, propertyId: allocation.property_id, summary: `Released ${allocation.code}`, metadata: { leaseId: allocation.lease_id, tenantId: allocation.tenant_id } });
  });
  refreshSpaceViews();
  safeRedirect("/spaces", "Space released");
}
