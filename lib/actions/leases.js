import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { all, get, run, scalar, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { today, uid } from "@/lib/format";
import { assertPermission } from "@/lib/permissions";
import { assertProperty, choice, integer, safeRedirect, text } from "@/lib/actions/shared";
import { supportsCapability } from "@/lib/modules/catalog";
import { resolveAgreementPricing } from "@/lib/modules/agreement-pricing";

function refreshLeaseViews() {
  ["/leases", "/handover", "/units", "/tenants", "/spaces", "/services", "/visitors", "/commercial", "/dashboard", "/audit", "/portal", "/portal/lease", "/portal/services", "/portal/visitors"].forEach(revalidatePath);
}

export async function createLeaseAction(formData) {
  const actor = await requireUser();
  const propertyId = await assertProperty(formData, actor);
  assertPermission(actor, "agreements.manage", propertyId);
  const unitId = integer(formData, "unitId");
  const tenantIds = [...new Set(formData.getAll("tenantIds").map(Number).filter(Boolean))];
  const requestedSpaceIds = [...new Set(formData.getAll("spaceIds").map(Number).filter(Boolean))];
  const status = choice(formData, "status", ["draft", "active"], "active");
  const unit = get("SELECT u.*,p.module_id,p.status property_status FROM units u JOIN properties p ON p.id=u.property_id WHERE u.id=$unitId AND u.property_id=$propertyId", { unitId, propertyId });
  if (!unit || unit.property_status !== "active" || ["maintenance", "inactive"].includes(unit.status)) throw new Error("Select active, rentable inventory");
  if (!tenantIds.length) throw new Error("Select at least one tenant");
  const validTenants = all(`SELECT id FROM tenants WHERE property_id=? AND status='active' AND id IN (${tenantIds.map(() => "?").join(",")})`, [propertyId, ...tenantIds]);
  if (validTenants.length !== tenantIds.length) throw new Error("One or more tenants are invalid or inactive");
  const spaceInventory = supportsCapability(unit.module_id, "spaceInventory");
  if (!spaceInventory && requestedSpaceIds.length) throw new Error("Selected property module does not use space inventory");
  if (!spaceInventory && unit.status !== "available") throw new Error("Select an available unit");
  if (spaceInventory) {
    const configuredSpaces = Number(scalar("SELECT COUNT(*) FROM rentable_spaces WHERE unit_id=$unitId AND status!='inactive'", { unitId }) || 0);
    const availableSpaces = Number(scalar("SELECT COUNT(*) FROM rentable_spaces WHERE unit_id=$unitId AND status='available'", { unitId }) || 0);
    if (!configuredSpaces) throw new Error("Configure bed or space inventory before creating a lease");
    if (status === "active" && availableSpaces < tenantIds.length) throw new Error("Not enough available spaces for the selected residents");
    if (status === "draft" && requestedSpaceIds.length) throw new Error("Draft agreements do not reserve spaces");
    if (status === "active" && requestedSpaceIds.length && requestedSpaceIds.length !== tenantIds.length) throw new Error("Select exactly one space for each resident, or leave spaces blank for automatic allocation");
  }
  const reference = uid("LEASE");
  transaction(() => {
    let allocatedSpaces = [];
    if (status === "active" && !spaceInventory) {
      const claimed = run(
        `UPDATE units SET status='occupied',updated_at=CURRENT_TIMESTAMP
         WHERE id=$unitId AND property_id=$propertyId AND status='available'`,
        { unitId, propertyId }
      );
      if (Number(claimed.changes) !== 1) throw new Error("Unit availability changed before the agreement could be created");
    }
    if (status === "active" && spaceInventory && requestedSpaceIds.length) {
      const selectedRows = all(`SELECT id,code,monthly_rate,deposit,gender_policy FROM rentable_spaces WHERE property_id=? AND unit_id=? AND status='available' AND id IN (${requestedSpaceIds.map(() => "?").join(",")})`, [propertyId, unitId, ...requestedSpaceIds]);
      const byId = new Map(selectedRows.map((space) => [Number(space.id), space]));
      allocatedSpaces = requestedSpaceIds.map((spaceId) => byId.get(spaceId)).filter(Boolean);
      if (allocatedSpaces.length !== tenantIds.length) throw new Error("One or more selected spaces are unavailable or belong to different inventory");
    } else if (status === "active" && spaceInventory) {
      allocatedSpaces = all(`SELECT id,code,monthly_rate,deposit,gender_policy FROM rentable_spaces WHERE property_id=$propertyId AND unit_id=$unitId AND status='available' AND gender_policy='any' ORDER BY id LIMIT $limit`, { propertyId, unitId, limit: tenantIds.length });
      if (allocatedSpaces.length !== tenantIds.length) throw new Error("Select exact spaces when occupancy policies apply, or review changed availability");
    }
    const pricing = resolveAgreementPricing({ spaces: allocatedSpaces, unitRate: unit.monthly_rate, unitDeposit: unit.deposit, requestedRent: text(formData, "monthlyRent"), requestedDeposit: text(formData, "deposit") });
    const startDate = text(formData, "startDate", true);
    const inserted = run(`INSERT INTO leases (property_id,unit_id,reference,start_date,end_date,monthly_rent,deposit,billing_day,status,notes) VALUES ($propertyId,$unitId,$reference,$startDate,$endDate,$rent,$deposit,$billingDay,$status,$notes)`, { propertyId, unitId, reference, startDate, endDate: text(formData, "endDate") || null, rent: pricing.monthlyRent, deposit: pricing.deposit, billingDay: Math.min(28, Math.max(1, integer(formData, "billingDay", 1))), status, notes: text(formData, "notes") });
    const leaseId = Number(inserted.lastInsertRowid);
    tenantIds.forEach((tenantId, index) => {
      run("INSERT INTO lease_tenants (lease_id,tenant_id,is_primary) VALUES ($leaseId,$tenantId,$primary)", { leaseId, tenantId, primary: index === 0 ? 1 : 0 });
      if (status === "active" && spaceInventory) {
        const spaceId = Number(allocatedSpaces[index].id);
        run(`INSERT INTO space_allocations (property_id,space_id,lease_id,tenant_id,start_date,status,created_by) VALUES ($propertyId,$spaceId,$leaseId,$tenantId,$startDate,'active',$createdBy)`, { propertyId, spaceId, leaseId, tenantId, startDate, createdBy: actor.id });
        const changed = run("UPDATE rentable_spaces SET status='occupied',updated_at=CURRENT_TIMESTAMP WHERE id=$spaceId AND status='available'", { spaceId });
        if (Number(changed.changes) !== 1) throw new Error("Space allocation conflict");
      }
    });
    if (status === "active" && spaceInventory) run("UPDATE units SET status='occupied',updated_at=CURRENT_TIMESTAMP WHERE id=$unitId", { unitId });
    recordAudit({ actor, action: "create", entityType: "lease", entityId: leaseId, propertyId, summary: `Created lease ${reference}`, metadata: { unitId, tenantCount: tenantIds.length, status, moduleId: unit.module_id, allocatedSpaceIds: allocatedSpaces.map((space) => Number(space.id)), explicitSpaceSelection: requestedSpaceIds.length > 0, pricingSource: pricing.source, monthlyRent: pricing.monthlyRent, deposit: pricing.deposit } });
  });
  refreshLeaseViews();
  safeRedirect("/leases", spaceInventory && status === "active" ? "Agreement created and spaces allocated" : "Agreement created");
}

export async function endLeaseAction(formData) {
  const actor = await requireUser();
  const leaseId = integer(formData, "leaseId");
  const lease = get("SELECT * FROM leases WHERE id=$leaseId", { leaseId });
  if (!lease || lease.status !== "active") throw new Error("Active lease not found");
  assertPermission(actor, "agreements.manage", lease.property_id);
  const unfinishedMoveOut = get("SELECT reference,status FROM property_inspections WHERE lease_id=$leaseId AND inspection_type='move_out' AND status!='completed' ORDER BY id DESC LIMIT 1", { leaseId });
  if (unfinishedMoveOut) throw new Error(`Complete move-out inspection ${unfinishedMoveOut.reference} before ending this lease`);
  const outstandingKeys = Number(scalar(`SELECT COALESCE(SUM(CASE action WHEN 'issued' THEN quantity WHEN 'replaced' THEN quantity ELSE -quantity END),0) FROM lease_key_transactions WHERE lease_id=$leaseId`, { leaseId }) || 0);
  if (outstandingKeys > 0) throw new Error(`Record the return or loss of ${outstandingKeys} outstanding key item(s) before move-out`);
  transaction(() => {
    run("UPDATE leases SET status='ended',end_date=COALESCE(end_date,$today),updated_at=CURRENT_TIMESTAMP WHERE id=$leaseId", { leaseId, today: today() });
    const spaces = all("SELECT space_id FROM space_allocations WHERE lease_id=$leaseId AND status='active'", { leaseId });
    run("UPDATE space_allocations SET status='ended',end_date=$today,updated_at=CURRENT_TIMESTAMP WHERE lease_id=$leaseId AND status='active'", { leaseId, today: today() });
    spaces.forEach((row) => run("UPDATE rentable_spaces SET status='available',updated_at=CURRENT_TIMESTAMP WHERE id=$spaceId AND status='occupied'", { spaceId: row.space_id }));
    run("UPDATE lease_services SET status='ended',end_date=$today,updated_at=CURRENT_TIMESTAMP WHERE lease_id=$leaseId AND status='active'", { leaseId, today: today() });
    run("UPDATE visitor_entries SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE lease_id=$leaseId AND status='expected'", { leaseId });
    const otherActiveLeases = Number(scalar("SELECT COUNT(*) FROM leases WHERE unit_id=$unitId AND status='active'", { unitId: lease.unit_id }) || 0);
    run("UPDATE units SET status=$status,updated_at=CURRENT_TIMESTAMP WHERE id=$unitId", { status: otherActiveLeases ? "occupied" : "available", unitId: lease.unit_id });
    run(`UPDATE tenants SET status='former',updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT tenant_id FROM lease_tenants WHERE lease_id=$leaseId) AND NOT EXISTS (SELECT 1 FROM lease_tenants other_lt JOIN leases other_l ON other_l.id=other_lt.lease_id WHERE other_lt.tenant_id=tenants.id AND other_l.status='active' AND other_l.id!=$leaseId)`, { leaseId });
    const depositHeld = Number(scalar("SELECT COALESCE(SUM(CASE transaction_type WHEN 'received' THEN amount WHEN 'credit' THEN amount ELSE -amount END),0) FROM deposit_transactions WHERE lease_id=$leaseId", { leaseId }) || 0);
    recordAudit({ actor, action: "end", entityType: "lease", entityId: leaseId, propertyId: lease.property_id, summary: `Completed move-out for ${lease.reference}`, metadata: { unitId: lease.unit_id, depositHeldAtMoveOut: depositHeld, releasedSpaces: spaces.length } });
  });
  refreshLeaseViews();
  safeRedirect("/leases", "Move-out completed");
}
