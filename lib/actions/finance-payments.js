import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { today, uid } from "@/lib/format";
import { assertPermission } from "@/lib/permissions";
import { assertProperty, integer, safeRedirect, text } from "@/lib/actions/shared";
import { saveProof, uploadDirectory, validDate } from "@/lib/actions/finance-common";
import { fromMinorUnits, moneyInput, toMinorUnits } from "@/lib/money";

export async function recordPaymentAction(formData) {
  const user = await requireUser();
  const propertyId = await assertProperty(formData, user);
  assertPermission(user, "payments.manage", propertyId);
  const invoiceId = integer(formData, "invoiceId") || null;
  const tenantId = integer(formData, "tenantId") || null;
  const paymentAmount = moneyInput(formData, "amount", { label: "Payment amount", minMinor: 1 });
  if (tenantId && !get("SELECT 1 FROM tenants WHERE id=$tenantId AND property_id=$propertyId", { tenantId, propertyId })) throw new Error("Invalid tenant");
  const proofPath = await saveProof(formData.get("proof"));
  try {
    transaction(() => {
      const invoice = invoiceId ? get("SELECT * FROM invoices WHERE id=$invoiceId AND property_id=$propertyId", { invoiceId, propertyId }) : null;
      let nextPaid = null;
      let nextStatus = null;
      if (invoiceId) {
        if (!invoice || ["paid", "void"].includes(invoice.status)) throw new Error("Invoice cannot receive a payment");
        if (tenantId && invoice.tenant_id && Number(invoice.tenant_id) !== tenantId) throw new Error("Payment tenant does not match the invoice tenant");
        const invoiceMinor = toMinorUnits(invoice.amount, "Invoice amount");
        const paidMinor = toMinorUnits(invoice.amount_paid, "Invoice paid amount");
        const balanceMinor = invoiceMinor - paidMinor;
        if (paymentAmount.minor > balanceMinor) throw new Error("Payment exceeds invoice balance");
        const nextPaidMinor = paidMinor + paymentAmount.minor;
        nextPaid = fromMinorUnits(nextPaidMinor);
        nextStatus = nextPaidMinor === invoiceMinor ? "paid" : "part_paid";
      }
      const reference = uid("PAY");
      const method = text(formData, "method") || "bank_transfer";
      const paidAt = validDate(text(formData, "paidAt") || today(), "Payment date");
      const result = run(
        `INSERT INTO payments (property_id,invoice_id,tenant_id,reference,amount,method,paid_at,proof_path,notes,recorded_by)
         VALUES ($propertyId,$invoiceId,$tenantId,$reference,$amount,$method,$paidAt,$proofPath,$notes,$userId)`,
        { propertyId, invoiceId, tenantId, amount: paymentAmount.value, proofPath, userId: user.id, reference, method, paidAt, notes: text(formData, "notes") }
      );
      if (invoice) {
        const changed = run(
          `UPDATE invoices SET amount_paid=$newPaid,status=$newStatus,updated_at=CURRENT_TIMESTAMP
           WHERE id=$invoiceId AND amount_paid=$currentPaid AND status=$currentStatus`,
          { newPaid: nextPaid, newStatus: nextStatus, invoiceId, currentPaid: invoice.amount_paid, currentStatus: invoice.status }
        );
        if (Number(changed.changes) !== 1) throw new Error("Invoice balance changed before the payment completed");
      }
      recordAudit({ actor: user, action: "record", entityType: "payment", entityId: Number(result.lastInsertRowid), propertyId, summary: `Recorded payment ${reference}`, metadata: { amount: paymentAmount.value, amountMinor: paymentAmount.minor, method, invoiceId, tenantId, proofUploaded: Boolean(proofPath) } });
    });
  } catch (error) {
    if (proofPath) { try { fs.unlinkSync(path.join(uploadDirectory, path.basename(proofPath))); } catch {} }
    throw error;
  }
  revalidatePath("/payments"); revalidatePath("/invoices"); revalidatePath("/dashboard"); revalidatePath("/audit");
  safeRedirect("/payments", "Payment recorded");
}
