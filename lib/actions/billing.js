import { revalidatePath } from "next/cache";
import { canAccessProperty, requireRole } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { today, uid } from "@/lib/format";
import { eligibleLateFeeInvoices, LATE_FEE_TYPES } from "@/lib/billing";
import { choice, integer, number, safeRedirect, text } from "@/lib/actions/shared";

function validDate(value, field, fallback = "") {
  const candidate = String(value || fallback || "").trim();
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) {
    throw new Error(`${field} must be a valid date`);
  }
  return candidate;
}

export async function updateBillingPolicyAction(formData) {
  const user = await requireRole(["owner", "admin"]);
  const propertyId = integer(formData, "propertyId");
  if (!propertyId || !canAccessProperty(user, propertyId)) throw new Error("Property access denied");
  const property = get("SELECT name FROM properties WHERE id=$propertyId", { propertyId });
  if (!property) throw new Error("Property not found");

  const graceDays = integer(formData, "graceDays");
  if (graceDays < 0 || graceDays > 60) throw new Error("Grace days must be between 0 and 60");
  const lateFeeType = choice(formData, "lateFeeType", LATE_FEE_TYPES, "none");
  let lateFeeValue = number(formData, "lateFeeValue");
  let lateFeeCap = number(formData, "lateFeeCap", 0);
  if (lateFeeValue < 0 || lateFeeCap < 0) throw new Error("Late-fee values cannot be negative");
  if (lateFeeType === "percent" && lateFeeValue > 100) throw new Error("Percentage late fees cannot exceed 100%");
  if (lateFeeType === "none") {
    lateFeeValue = 0;
    lateFeeCap = 0;
  } else if (lateFeeValue <= 0) {
    throw new Error("Enter a positive late-fee value");
  }

  const previous = get("SELECT * FROM billing_policies WHERE property_id=$propertyId", { propertyId });
  transaction(() => {
    run(
      `INSERT INTO billing_policies
        (property_id,grace_days,late_fee_type,late_fee_value,late_fee_cap,updated_by,updated_at)
       VALUES ($propertyId,$graceDays,$lateFeeType,$lateFeeValue,$lateFeeCap,$userId,CURRENT_TIMESTAMP)
       ON CONFLICT(property_id) DO UPDATE SET
        grace_days=excluded.grace_days,
        late_fee_type=excluded.late_fee_type,
        late_fee_value=excluded.late_fee_value,
        late_fee_cap=excluded.late_fee_cap,
        updated_by=excluded.updated_by,
        updated_at=CURRENT_TIMESTAMP`,
      { propertyId, graceDays, lateFeeType, lateFeeValue, lateFeeCap: lateFeeCap || null, userId: user.id }
    );
    recordAudit({
      actor: user,
      action: "settings",
      entityType: "billing_policy",
      entityId: propertyId,
      propertyId,
      summary: `Updated late-fee policy for ${property.name}`,
      metadata: {
        previous: previous ? {
          graceDays: previous.grace_days,
          type: previous.late_fee_type,
          value: previous.late_fee_value,
          cap: previous.late_fee_cap
        } : null,
        current: { graceDays, type: lateFeeType, value: lateFeeValue, cap: lateFeeCap || null }
      }
    });
  });

  revalidatePath("/billing");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/audit");
  safeRedirect("/billing", `Billing policy saved for ${property.name}`);
}

export async function createLateFeeRunAction(formData) {
  const user = await requireRole(["owner", "admin"]);
  const selectedPropertyId = integer(formData, "propertyId") || null;
  if (selectedPropertyId && !canAccessProperty(user, selectedPropertyId)) throw new Error("Property access denied");
  const issueDate = validDate(text(formData, "issueDate") || today(), "Issue date");

  const result = transaction(() => {
    const eligible = eligibleLateFeeInvoices(user, selectedPropertyId);
    if (!eligible.length) throw new Error("No rent invoices are eligible for a late fee");
    let created = 0;
    let skipped = 0;
    for (const invoice of eligible) {
      const inserted = run(
        `INSERT OR IGNORE INTO invoices
          (property_id,lease_id,tenant_id,source_invoice_id,number,description,issue_date,due_date,amount,charge_type,status)
         VALUES
          ($propertyId,$leaseId,$tenantId,$sourceInvoiceId,$number,$description,$issueDate,$issueDate,$amount,'late_fee','issued')`,
        {
          propertyId: invoice.property_id,
          leaseId: invoice.lease_id || null,
          tenantId: invoice.tenant_id || null,
          sourceInvoiceId: invoice.id,
          number: uid("INV"),
          description: `Late fee · ${invoice.number}`,
          issueDate,
          amount: Number(invoice.fee_amount)
        }
      );
      if (Number(inserted.changes || 0) === 1) {
        created += 1;
        recordAudit({
          actor: user,
          action: "generate",
          entityType: "invoice",
          entityId: Number(inserted.lastInsertRowid),
          propertyId: invoice.property_id,
          summary: `Generated late fee for ${invoice.number}`,
          metadata: {
            sourceInvoiceId: invoice.id,
            amount: Number(invoice.fee_amount),
            type: invoice.late_fee_type,
            value: Number(invoice.late_fee_value),
            cap: invoice.late_fee_cap === null ? null : Number(invoice.late_fee_cap),
            graceDays: Number(invoice.grace_days)
          }
        });
      } else {
        skipped += 1;
      }
    }
    return { created, skipped };
  });

  revalidatePath("/billing");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/audit");
  const skippedText = result.skipped ? `; ${result.skipped} already existed` : "";
  safeRedirect("/billing", `${result.created} late-fee invoice${result.created === 1 ? "" : "s"} created${skippedText}`);
}

export async function voidInvoiceAction(formData) {
  const user = await requireRole(["owner", "admin"]);
  const invoiceId = integer(formData, "invoiceId");
  const invoice = transaction(() => {
    const current = get("SELECT * FROM invoices WHERE id=$invoiceId", { invoiceId });
    if (!current || !canAccessProperty(user, current.property_id)) throw new Error("Invoice access denied");
    if (current.status === "void") throw new Error("Invoice is already void");
    if (Number(current.amount_paid) > 0) throw new Error("Paid or part-paid invoices cannot be voided");
    const activeChild = get(
      "SELECT number FROM invoices WHERE source_invoice_id=$invoiceId AND charge_type='late_fee' AND status!='void' LIMIT 1",
      { invoiceId }
    );
    if (activeChild) throw new Error(`Void late fee ${activeChild.number} before voiding its source invoice`);
    run("UPDATE invoices SET status='void',updated_at=CURRENT_TIMESTAMP WHERE id=$invoiceId", { invoiceId });
    recordAudit({
      actor: user,
      action: "void",
      entityType: "invoice",
      entityId: invoiceId,
      propertyId: current.property_id,
      summary: `Voided invoice ${current.number}`,
      metadata: {
        chargeType: current.charge_type,
        amount: Number(current.amount),
        sourceInvoiceId: current.source_invoice_id || null
      }
    });
    return current;
  });

  revalidatePath("/billing");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/audit");
  safeRedirect("/invoices", `Invoice ${invoice.number} voided`);
}
