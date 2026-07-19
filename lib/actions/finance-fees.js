import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { today, uid } from "@/lib/format";
import { eligibleLateFeeInvoices } from "@/lib/billing";
import { assertPermission } from "@/lib/permissions";
import { integer, safeRedirect, text } from "@/lib/actions/shared";
import { validDate } from "@/lib/actions/finance-common";
import { normalizedMoney, toMinorUnits } from "@/lib/money";

export async function createLateFeeRunAction(formData) {
  const user = await requireUser();
  const selectedPropertyId = integer(formData, "propertyId") || null;
  if (selectedPropertyId) assertPermission(user, "billing.manage", selectedPropertyId);
  const issueDate = validDate(text(formData, "issueDate") || today(), "Issue date");
  const result = transaction(() => {
    const eligible = eligibleLateFeeInvoices(user, selectedPropertyId);
    if (!eligible.length) throw new Error("No permitted rent invoices are eligible for a late fee");
    let created = 0; let skipped = 0;
    for (const invoice of eligible) {
      const feeAmount = normalizedMoney(invoice.fee_amount, "Late fee");
      if (toMinorUnits(feeAmount, "Late fee") <= 0) { skipped += 1; continue; }
      const inserted = run(
        `INSERT OR IGNORE INTO invoices
          (property_id,lease_id,tenant_id,source_invoice_id,number,description,issue_date,due_date,amount,charge_type,status)
         VALUES ($propertyId,$leaseId,$tenantId,$sourceInvoiceId,$number,$description,$issueDate,$issueDate,$amount,'late_fee','issued')`,
        { propertyId: invoice.property_id, leaseId: invoice.lease_id || null, tenantId: invoice.tenant_id || null, sourceInvoiceId: invoice.id, number: uid("INV"), description: `Late fee · ${invoice.number}`, issueDate, amount: feeAmount }
      );
      if (Number(inserted.changes || 0) === 1) {
        created += 1;
        recordAudit({ actor: user, action: "generate", entityType: "invoice", entityId: Number(inserted.lastInsertRowid), propertyId: invoice.property_id, summary: `Generated late fee for ${invoice.number}`, metadata: { sourceInvoiceId: invoice.id, amount: feeAmount, amountMinor: toMinorUnits(feeAmount), type: invoice.late_fee_type, value: Number(invoice.late_fee_value), graceDays: Number(invoice.grace_days) } });
      } else skipped += 1;
    }
    return { created, skipped };
  });
  revalidatePath("/billing"); revalidatePath("/invoices"); revalidatePath("/dashboard"); revalidatePath("/reports"); revalidatePath("/audit");
  const skippedText = result.skipped ? `; ${result.skipped} skipped or already existed` : "";
  safeRedirect("/invoices", `${result.created} late fee invoice${result.created === 1 ? "" : "s"} created${skippedText}`);
}

export async function voidInvoiceAction(formData) {
  const user = await requireUser();
  const invoiceId = integer(formData, "invoiceId");
  const invoice = transaction(() => {
    const current = get("SELECT * FROM invoices WHERE id=$invoiceId", { invoiceId });
    if (!current) throw new Error("Invoice not found");
    assertPermission(user, "billing.manage", current.property_id);
    if (current.status === "void") throw new Error("Invoice is already void");
    if (toMinorUnits(current.amount_paid, "Paid amount") > 0) throw new Error("Paid or part-paid invoices cannot be voided; preserve the payment ledger and issue an adjustment instead");
    const activeChild = get("SELECT number FROM invoices WHERE source_invoice_id=$invoiceId AND charge_type='late_fee' AND status!='void' LIMIT 1", { invoiceId });
    if (activeChild) throw new Error(`Void late fee ${activeChild.number} before voiding its source invoice`);
    const changed = run("UPDATE invoices SET status='void',updated_at=CURRENT_TIMESTAMP WHERE id=$invoiceId AND status=$currentStatus AND amount_paid=$currentPaid", { invoiceId, currentStatus: current.status, currentPaid: current.amount_paid });
    if (Number(changed.changes) !== 1) throw new Error("Invoice status changed before voiding completed");
    recordAudit({ actor: user, action: "void", entityType: "invoice", entityId: invoiceId, propertyId: current.property_id, summary: `Voided invoice ${current.number}`, metadata: { chargeType: current.charge_type, amount: normalizedMoney(current.amount), sourceInvoiceId: current.source_invoice_id || null } });
    return current;
  });
  revalidatePath("/billing"); revalidatePath("/invoices"); revalidatePath("/dashboard"); revalidatePath("/reports"); revalidatePath("/audit");
  safeRedirect("/invoices", `Invoice ${invoice.number} voided`);
}
