import { revalidatePath } from "next/cache";
import { canAccessProperty, requireRole } from "@/lib/auth";
import { all, get, run, transaction } from "@/lib/db";
import { today, uid } from "@/lib/format";
import { assertProperty, integer, number, safeRedirect, text } from "@/lib/actions/shared";

export async function createLeaseAction(formData) {
  const user = await requireRole(["owner", "admin"]);
  const propertyId = await assertProperty(formData, user);
  const unitId = integer(formData, "unitId");
  const tenantIds = formData.getAll("tenantIds").map(Number).filter(Boolean);
  const unit = get("SELECT * FROM units WHERE id=$unitId AND property_id=$propertyId", { unitId, propertyId });
  if (!unit || unit.status !== "available") throw new Error("Select an available unit");
  if (!tenantIds.length) throw new Error("Select at least one tenant");
  const validTenants = all(`SELECT id FROM tenants WHERE property_id=$propertyId AND id IN (${tenantIds.map(() => "?").join(",")})`, [propertyId, ...tenantIds]);
  if (validTenants.length !== tenantIds.length) throw new Error("One or more tenants are invalid");
  const status = text(formData, "status") || "active";
  const reference = uid("LEASE");
  transaction(() => {
    const inserted = run(
      `INSERT INTO leases (property_id,unit_id,reference,start_date,end_date,monthly_rent,deposit,billing_day,status,notes)
       VALUES ($propertyId,$unitId,$reference,$startDate,$endDate,$rent,$deposit,$billingDay,$status,$notes)`,
      {
        propertyId, unitId, reference,
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
    tenantIds.forEach((tenantId, index) => run(
      "INSERT INTO lease_tenants (lease_id,tenant_id,is_primary) VALUES ($leaseId,$tenantId,$primary)",
      { leaseId, tenantId, primary: index === 0 ? 1 : 0 }
    ));
    if (status === "active") run("UPDATE units SET status='occupied',updated_at=CURRENT_TIMESTAMP WHERE id=$unitId", { unitId });
  });
  revalidatePath("/leases");
  revalidatePath("/units");
  revalidatePath("/dashboard");
  safeRedirect("/leases", "Lease created");
}

export async function endLeaseAction(formData) {
  const user = await requireRole(["owner", "admin"]);
  const leaseId = integer(formData, "leaseId");
  const lease = get("SELECT * FROM leases WHERE id=$leaseId", { leaseId });
  if (!lease || lease.status !== "active" || !canAccessProperty(user, lease.property_id)) throw new Error("Active lease access denied");
  transaction(() => {
    run("UPDATE leases SET status='ended',end_date=COALESCE(end_date,$today),updated_at=CURRENT_TIMESTAMP WHERE id=$leaseId", { leaseId, today: today() });
    run("UPDATE units SET status='available',updated_at=CURRENT_TIMESTAMP WHERE id=$unitId", { unitId: lease.unit_id });
    run(`UPDATE tenants SET status='former',updated_at=CURRENT_TIMESTAMP
      WHERE id IN (SELECT tenant_id FROM lease_tenants WHERE lease_id=$leaseId)
      AND NOT EXISTS (
        SELECT 1 FROM lease_tenants other_lt
        JOIN leases other_l ON other_l.id=other_lt.lease_id
        WHERE other_lt.tenant_id=tenants.id AND other_l.status='active' AND other_l.id!=$leaseId
      )`, { leaseId });
  });
  revalidatePath("/leases");
  revalidatePath("/units");
  safeRedirect("/leases", "Move-out completed");
}
