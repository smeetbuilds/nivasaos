import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { today, uid } from "@/lib/format";
import { assertPermission } from "@/lib/permissions";
import { assertProperty, integer, number, safeRedirect, text } from "@/lib/actions/shared";
import { saveProof, uploadDirectory, validDate } from "@/lib/actions/finance-common";

export async function recordPaymentAction(formData) {
  const user = await requireUser();
  const propertyId = await assertProperty(formData, user);
  assertPermission(user, "payments.manage", propertyId);
  const invoiceId = integer(formData, "invoiceId") || null;
  const tenantId = integer(formData, "tenantId") || null;
  const amount = number(formData, "amount");
  if (amount <= 0) throw new Error("Payment amount must be positive");
  if (tenantId && !get("SELECT 1 FROM tenants WHERE id=$tenantId AND property_id=$propertyId", { tenantId, propertyId })) throw new Error("Invalid tenant");
  const proofPath = await saveProof(formData.get("proof"));
  try {
    transaction(() => {
      const invoice = invoiceId ? get("SELECT * FROM invoices WHERE id=$invoiceId AND property_id=$propertyId", { invoiceId, propertyId }) : null;
      if (invoiceId) {
        if (!invoice || ["paid", "void"].includes(invoice.status)) throw new Error("Invoice cannot receive a payment");
        const balance = Number(invoice.amount) - Number(invoice.amount_paid);
        if (amount > balance + 0.001) throw new Error("Payment exceeds invoice balance");
      }
      const reference = uid("PAY");
      const method = text(formData, "method") || "bank_transfer";
      const paidAt = validDate(text(formData, "paidAt") || today(), "Payment date");
      const result = run(
        `INSERT INTO payments (property_id,invoice_id,tenant_id,reference,amount,method,paid_at,proof_path,notes,recorded_by)
         VALUES ($propertyId,$invoiceId,$tenantId,$reference,$amount,$method,$paidAt,$proofPath,$notes,$userId)`,
        { propertyId, invoiceId, tenantId, amount, proofPath, userId: user.id, reference, method, paidAt, notes: text(formData, "notes") }
      );
      recordAudit({ actor: user, action: "record", entityType: "payment", entityId: Number(result.lastInsertRowid), propertyId, summary: `Recorded payment ${reference}`, metadata: { amount, method, invoiceId, tenantId, proofUploaded: Boolean(proofPath) } });
      if (invoice) {
        const newPaid = Number(invoice.amount_paid) + amount;
        const newStatus = newPaid >= Number(invoice.amount) ? "paid" : "part_paid";
        run("UPDATE invoices SET amount_paid=$newPaid,status=$newStatus,updated_at=CURRENT_TIMESTAMP WHERE id=$invoiceId", { newPaid, newStatus, invoiceId });
      }
    });
  } catch (error) {
    if (proofPath) { try { fs.unlinkSync(path.join(uploadDirectory, path.basename(proofPath))); } catch {} }
    throw error;
  }
  revalidatePath("/payments"); revalidatePath("/invoices"); revalidatePath("/dashboard"); revalidatePath("/audit");
  safeRedirect("/payments", "Payment recorded");
}
