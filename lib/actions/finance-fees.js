import { revalidatePath } from "next/cache";
import { canAccessProperty, requireRole } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { today, uid } from "@/lib/format";
import { eligibleLateFeeInvoices } from "@/lib/billing";
import { integer, safeRedirect, text } from "@/lib/actions/shared";
import { validDate } from "@/lib/actions/finance-common";

export async function createLateFeeRunAction(formData) {
  const user = await requireRole(["owner", "admin"]);
  const selectedPropertyId = integer(formData, "propertyId") || null;
  if (selectedPropertyId && !canAccessProperty(user, selectedPropertyId)) throw new Error("Property access denied");
  const issueDate = validDate(text(formData, "issueDate") || today(), "Issue date");
  const result = transaction(() => {
    const eligible = eligibleLateFeeInvoices(user, selectedPropertyId);
    if (!eligible.length) throw new Error("No rent invoices are eligible for a late fee");
    let created = 0; let skipped = 0;
    for (const invoice of eligible) {
      const inserted = run(
        `INSERT OR IGNORE INTO invoices
          (property_id,lease_id,tenant_id,source_invoice_id,number,description,issue_date,due_date,amount,charge_type,status)
         VALUES ($propertyId,$leaseId,$tenantId,$sourceInvoiceId,$number,$description,$issueDate,$issueDate,$amount,'late_fee','issued')`,
        { propertyId: invoice.property_id, leaseId: invoice.lease_id || null, tenantId: invoice.tenant_id || null, sourceInvoiceId: invoice.id, number: uid("INV"), description: `Late fee · ${invoice.number}`, issueDate, amount: Number(invoice.fee_amount) }
      );
      if (Number(inserted.changes || 0) === 1) {
        created += 1;
        recordAudit({ actor: user, action: "generate", entityType: "invoice", entityId: Number(inserted.lastInsertRowid), propertyId: invoice.property_id, summary: `Generated late fee for ${invoice.number}`, metadata: { sourceInvoiceId: invoice.id, amount: Number(invoice.fee_amount), type: invoice.late_fee_type, value: Number(invoice.late_fee_value), graceDays: Number(invoice.grace_days) } });
      } else skipped += 1;
    }
    return { created, skipped };
  });
  revalidatePath("/billing"); revalidatePath("/invoices"); revalidatePath("/dashboard"); revalidatePath("/reports"); revalidatePath("/audit");
  const skippedText = result.skipped ? `; ${result.skipped} already existed` : "";
  safeRedirect("/invoices", `${result.created} late fee invoice${result.created === 1 ? "" : "s"} created${skippedText}`);
}

export async function voidInvoiceAction(formData) {
  const user = await requireRole(["owner", "admin"]);
  const invoiceId = integer(formData, "invoiceId");
  const invoice = transaction(() => {
    const current = get("SELECT * FROM invoices WHERE id=$invoiceId", { invoiceId });
    if (!current || !canAccessProperty(user, current.property_id)) throw new Error("Invoice access denied");
    if (current.status === "void") throw new Error("Invoice is already void");
    if (Number(current.amount_paid) > 0) throw new Error("Paid or part-paid invoices cannot be voided; preserve the payment ledger and issue an adjustment instead");
    const activeChild = get("SELECT number FROM invoices WHERE source_invoice_id=$invoiceId AND charge_type='late_fee' AND status!='void' LIMIT 1", { invoiceId });
    if (activeChild) throw new Error(`Void late fee ${activeChild.number} before voiding its source invoice`);
    run("UPDATE invoices SET status='void',updated_at=CURRENT_TIMESTAMP WHERE id=$invoiceId", { invoiceId });
    recordAudit({ actor: user, action: "void", entityType: "invoice", entityId: invoiceId, propertyId: current.property_id, summary: `Voided invoice ${current.number}`, metadata: { chargeType: current.charge_type, amount: Number(current.amount), sourceInvoiceId: current.source_invoice_id || null } });
    return current;
  });
  revalidatePath("/billing"); revalidatePath("/invoices"); revalidatePath("/dashboard"); revalidatePath("/reports"); revalidatePath("/audit");
  safeRedirect("/invoices", `Invoice ${invoice.number} voided`);
}
