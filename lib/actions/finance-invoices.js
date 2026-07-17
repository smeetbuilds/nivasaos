import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { all, get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { today, uid } from "@/lib/format";
import { normalizeRentPeriod, rentDueDate, rentPeriodBounds, rentPeriodLabel } from "@/lib/rent";
import { assertPermission, permissionScopeSql } from "@/lib/permissions";
import { assertProperty, integer, number, safeRedirect, text } from "@/lib/actions/shared";
import { validDate } from "@/lib/actions/finance-common";

export async function createInvoiceAction(formData) {
  const user = await requireUser();
  const propertyId = await assertProperty(formData, user);
  assertPermission(user, "billing.manage", propertyId);
  const leaseId = integer(formData, "leaseId") || null;
  const tenantId = integer(formData, "tenantId") || null;
  if (leaseId && !get("SELECT 1 FROM leases WHERE id=$leaseId AND property_id=$propertyId", { leaseId, propertyId })) throw new Error("Invalid lease");
  if (tenantId && !get("SELECT 1 FROM tenants WHERE id=$tenantId AND property_id=$propertyId", { tenantId, propertyId })) throw new Error("Invalid tenant");
  const invoiceAmount = number(formData, "amount");
  if (invoiceAmount <= 0) throw new Error("Invoice amount must be positive");
  const issueDate = validDate(text(formData, "issueDate") || today(), "Issue date");
  const dueDate = validDate(text(formData, "dueDate", true), "Due date");
  if (dueDate < issueDate) throw new Error("Due date cannot be before the issue date");
  const numberValue = uid("INV");
  const description = text(formData, "description", true);
  transaction(() => {
    const result = run(
      `INSERT INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,status)
       VALUES ($propertyId,$leaseId,$tenantId,$number,$description,$issueDate,$dueDate,$amount,'issued')`,
      { propertyId, leaseId, tenantId, number: numberValue, description, issueDate, dueDate, amount: invoiceAmount }
    );
    recordAudit({ actor: user, action: "create", entityType: "invoice", entityId: Number(result.lastInsertRowid), propertyId, summary: `Created invoice ${numberValue}`, metadata: { amount: invoiceAmount, dueDate, leaseId, tenantId } });
  });
  revalidatePath("/invoices"); revalidatePath("/dashboard"); revalidatePath("/audit");
  safeRedirect("/invoices", "Invoice created");
}

export async function createRentRunAction(formData) {
  const user = await requireUser();
  const period = normalizeRentPeriod(text(formData, "period", true));
  const selectedPropertyId = integer(formData, "propertyId") || null;
  if (selectedPropertyId) assertPermission(user, "billing.manage", selectedPropertyId);
  const issueDate = validDate(text(formData, "issueDate") || today(), "Issue date");
  const { start: periodStart, end: periodEnd } = rentPeriodBounds(period);
  const scope = permissionScopeSql(user, "billing.manage", "p");
  const filters = [scope.clause, "p.status='active'", "l.status='active'", "l.start_date <= $periodEnd", "(l.end_date IS NULL OR l.end_date >= $periodStart)"];
  const params = { ...scope.params, periodStart, periodEnd };
  if (selectedPropertyId) { filters.push("p.id=$propertyId"); params.propertyId = selectedPropertyId; }
  const leases = all(
    `SELECT l.id,l.property_id,l.reference,l.monthly_rent,l.billing_day,p.name property_name,
      (SELECT lt.tenant_id FROM lease_tenants lt WHERE lt.lease_id=l.id ORDER BY lt.is_primary DESC,lt.tenant_id LIMIT 1) tenant_id
     FROM leases l JOIN properties p ON p.id=l.property_id
     WHERE ${filters.join(" AND ")} ORDER BY p.name,l.reference`, params
  );
  if (!leases.length) throw new Error("No permitted active leases match this rent period");
  const label = rentPeriodLabel(period);
  const result = transaction(() => {
    let created = 0; let skipped = 0;
    for (const lease of leases) {
      const inserted = run(
        `INSERT OR IGNORE INTO invoices
          (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,rent_period,charge_type,status)
         VALUES ($propertyId,$leaseId,$tenantId,$number,$description,$issueDate,$dueDate,$amount,$period,'rent','issued')`,
        { propertyId: lease.property_id, leaseId: lease.id, tenantId: lease.tenant_id || null, number: uid("INV"), description: `Rent · ${label}`, issueDate, dueDate: rentDueDate(period, lease.billing_day), amount: Number(lease.monthly_rent), period }
      );
      if (Number(inserted.changes || 0) === 1) {
        created += 1;
        recordAudit({ actor: user, action: "generate", entityType: "invoice", entityId: Number(inserted.lastInsertRowid), propertyId: lease.property_id, summary: `Generated ${label} rent invoice for ${lease.reference}`, metadata: { amount: Number(lease.monthly_rent), period, leaseId: lease.id } });
      } else skipped += 1;
    }
    return { created, skipped };
  });
  revalidatePath("/invoices"); revalidatePath("/dashboard"); revalidatePath("/reports"); revalidatePath("/audit");
  const skippedText = result.skipped ? `; ${result.skipped} already existed` : "";
  safeRedirect("/invoices", `${result.created} rent invoice${result.created === 1 ? "" : "s"} created${skippedText}`);
}
