import { revalidatePath } from "next/cache";
import { canAccessProperty, requireRole } from "@/lib/auth";
import { all, get, run, scalar, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { today, uid } from "@/lib/format";
import { assertProperty, choice, integer, number, safeRedirect, text } from "@/lib/actions/shared";
import { supportsCapability } from "@/lib/modules/catalog";

function refreshLeaseViews() {
  ["/leases", "/handover", "/units", "/tenants", "/spaces", "/services", "/visitors", "/commercial", "/dashboard", "/audit", "/portal", "/portal/lease", "/portal/services", "/portal/visitors"].forEach(revalidatePath);
}

export async function createLeaseAction(formData) {
  const actor = await requireRole(["owner", "admin"]);
  const propertyId = await assertProperty(formData, actor);
  const unitId = integer(formData, "unitId");
  const tenantIds = [...new Set(formData.getAll("tenantIds").map(Number).filter(Boolean))];
  const unit = get("SELECT u.*,p.module_id,p.status property_status FROM units u JOIN properties p ON p.id=u.property_id WHERE u.id=$unitId AND u.property_id=$propertyId", { unitId, propertyId });
  if (!unit || unit.property_status !== "active" || ["maintenance", "inactive"].includes(unit.status)) throw new Error("Select active, rentable inventory");
  if (!tenantIds.length) throw new Error("Select at least one tenant");
  const validTenants = all(`SELECT id FROM tenants WHERE property_id=$propertyId AND status='active' AND id IN (${tenantIds.map(() => "?").join(",")})`, [propertyId, ...tenantIds]);
  if (validTenants.length !== tenantIds.length) throw new Error("One or more tenants are invalid or inactive");
  const spaceInventory = supportsCapability(unit.module_id, "spaceInventory");
  if (!spaceInventory && unit.status !== "available") throw new Error("Select an available unit");
  if (spaceInventory) {
    const configuredSpaces = Number(scalar("SELECT COUNT(*) FROM rentable_spaces WHERE unit_id=$unitId AND status!='inactive'", { unitId }) || 0);
    const availableSpaces = Number(scalar("SELECT COUNT(*) FROM rentable_spaces WHERE unit_id=$unitId AND status='available'", { unitId }) || 0);
    if (!configuredSpaces) throw new Error("Configure bed or space inventory before creating a lease");
    if (availableSpaces < tenantIds.length) throw new Error("Not enough available spaces for the selected residents");
  }
  const status = choice(formData, "status", ["draft", "active"], "active");
  const reference = uid("LEASE");
  transaction(() => {
    const allocatedSpaces = status === "active" && spaceInventory
      ? all("SELECT id FROM rentable_spaces WHERE unit_id=$unitId AND status='available' ORDER BY id LIMIT $limit", { unitId, limit: tenantIds.length })
      : [];
    if (status === "active" && spaceInventory && allocatedSpaces.length !== tenantIds.length) throw new Error("Space availability changed. Review inventory and try again");
    const inserted = run(
      `INSERT INTO leases (property_id,unit_id,reference,start_date,end_date,monthly_rent,deposit,billing_day,status,notes)
       VALUES ($propertyId,$unitId,$reference,$startDate,$endDate,$rent,$deposit,$billingDay,$status,$notes)`,
      {
        propertyId,
        unitId,
        reference,
        startDate: text(formData, "startDate", true),
        endDate: text(formData, "endDate") || null,
        rent: Math.max(0, number(formData, "monthlyRent", unit.monthly_rate)),
        deposit: Math.max(0, number(formData, "deposit", unit.deposit)),
        billingDay: Math.min(28, Math.max(1, integer(formData, "billingDay", 1))),
        status,
        notes: text(formData, "notes")
      }
    );
    const leaseId = Number(inserted.lastInsertRowid);
    tenantIds.forEach((tenantId, index) => {
      run("INSERT INTO lease_tenants (lease_id,tenant_id,is_primary) VALUES ($leaseId,$tenantId,$primary)", { leaseId, tenantId, primary: index === 0 ? 1 : 0 });
      if (status === "active" && spaceInventory) {
        const spaceId = Number(allocatedSpaces[index].id);
        run(
          `INSERT INTO space_allocations (property_id,space_id,lease_id,tenant_id,start_date,status,created_by)
           VALUES ($propertyId,$spaceId,$leaseId,$tenantId,$startDate,'active',$createdBy)`,
          { propertyId, spaceId, leaseId, tenantId, startDate: text(formData, "startDate", true), createdBy: actor.id }
        );
        const changed = run("UPDATE rentable_spaces SET status='occupied',updated_at=CURRENT_TIMESTAMP WHERE id=$spaceId AND status='available'", { spaceId });
        if (Number(changed.changes) !== 1) throw new Error("Space allocation conflict");
      }
    });
    if (status === "active") run("UPDATE units SET status='occupied',updated_at=CURRENT_TIMESTAMP WHERE id=$unitId", { unitId });
    recordAudit({ actor, action: "create", entityType: "lease", entityId: leaseId, propertyId, summary: `Created lease ${reference}`, metadata: { unitId, tenantCount: tenantIds.length, status, moduleId: unit.module_id, autoAllocatedSpaces: allocatedSpaces.length } });
  });
  refreshLeaseViews();
  safeRedirect("/leases", spaceInventory && status === "active" ? "Lease created and spaces allocated" : "Lease created");
}

export async function endLeaseAction(formData) {
  const actor = await requireRole(["owner", "admin"]);
  const leaseId = integer(formData, "leaseId");
  const lease = get("SELECT * FROM leases WHERE id=$leaseId", { leaseId });
  if (!lease || lease.status !== "active" || !canAccessProperty(actor, lease.property_id)) throw new Error("Active lease access denied");
  const unfinishedMoveOut = get(
    "SELECT reference,status FROM property_inspections WHERE lease_id=$leaseId AND inspection_type='move_out' AND status!='completed' ORDER BY id DESC LIMIT 1",
    { leaseId }
  );
  if (unfinishedMoveOut) throw new Error(`Complete move-out inspection ${unfinishedMoveOut.reference} before ending this lease`);
  const outstandingKeys = Number(scalar(
    `SELECT COALESCE(SUM(CASE action WHEN 'issued' THEN quantity WHEN 'replaced' THEN quantity ELSE -quantity END),0)
     FROM lease_key_transactions WHERE lease_id=$leaseId`,
    { leaseId }
  ) || 0);
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
    run(`UPDATE tenants SET status='former',updated_at=CURRENT_TIMESTAMP
      WHERE id IN (SELECT tenant_id FROM lease_tenants WHERE lease_id=$leaseId)
      AND NOT EXISTS (
        SELECT 1 FROM lease_tenants other_lt
        JOIN leases other_l ON other_l.id=other_lt.lease_id
        WHERE other_lt.tenant_id=tenants.id AND other_l.status='active' AND other_l.id!=$leaseId
      )`, { leaseId });
    const depositHeld = Number(scalar(
      "SELECT COALESCE(SUM(CASE transaction_type WHEN 'received' THEN amount WHEN 'credit' THEN amount ELSE -amount END),0) FROM deposit_transactions WHERE lease_id=$leaseId",
      { leaseId }
    ) || 0);
    recordAudit({ actor, action: "end", entityType: "lease", entityId: leaseId, propertyId: lease.property_id, summary: `Completed move-out for ${lease.reference}`, metadata: { unitId: lease.unit_id, depositHeldAtMoveOut: depositHeld, releasedSpaces: spaces.length } });
  });
  refreshLeaseViews();
  safeRedirect("/leases", "Move-out completed");
}
