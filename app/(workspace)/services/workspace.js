import { canAccessProperty, requireUser } from "@/lib/auth";
import { get, run, scalar, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { today, uid } from "@/lib/format";
import { choice, integer, number, safeRedirect, text } from "@/lib/actions/shared";
import { saveProof, validDate } from "@/lib/actions/finance-common";
import { portalInvoice, requireTenant } from "@/lib/tenant-auth";
import { limitedText, paymentMethod, refreshPortalViews, removeUpload } from "@/lib/actions/portal-common";

export async function submitTenantPaymentAction(formData) {
  const tenant = await requireTenant();
  const invoiceId = integer(formData, "invoiceId");
  const invoice = portalInvoice(tenant.tenant_id, invoiceId);
  if (!invoice || ["paid", "void"].includes(invoice.status)) throw new Error("Invoice cannot receive a payment submission");
  const amount = number(formData, "amount");
  if (amount <= 0) throw new Error("Amount must be positive");
  const proofPath = await saveProof(formData.get("proof"));
  if (!proofPath) throw new Error("Upload payment proof before submitting");
  try {
    transaction(() => {
      const currentInvoice = portalInvoice(tenant.tenant_id, invoiceId);
      if (!currentInvoice || ["paid", "void"].includes(currentInvoice.status)) throw new Error("Invoice cannot receive a payment submission");
      const balance = Number(currentInvoice.amount) - Number(currentInvoice.amount_paid);
      const pending = Number(scalar("SELECT COALESCE(SUM(amount),0) FROM payment_submissions WHERE invoice_id=$invoiceId AND status='pending'", { invoiceId }) || 0);
      if (amount > balance - pending + 0.001) throw new Error("Amount exceeds the invoice balance remaining after pending submissions");
      const result = run(
        `INSERT INTO payment_submissions (property_id,tenant_id,invoice_id,amount,method,paid_at,external_reference,proof_path,notes)
         VALUES ($propertyId,$tenantId,$invoiceId,$amount,$method,$paidAt,$externalReference,$proofPath,$notes)`,
        {
          propertyId: invoice.property_id,
          tenantId: tenant.tenant_id,
          invoiceId,
          amount,
          method: paymentMethod(formData),
          paidAt: validDate(text(formData, "paidAt") || today(), "Payment date"),
          externalReference: limitedText(formData, "externalReference", 200),
          proofPath,
          notes: limitedText(formData, "notes", 2000)
        }
      );
      recordAudit({ tenantActor: tenant, action: "create", entityType: "payment_submission", entityId: Number(result.lastInsertRowid), propertyId: invoice.property_id, summary: `${tenant.full_name} submitted payment proof for ${invoice.number}`, metadata: { amount, invoiceId } });
    });
  } catch (error) {
    removeUpload(proofPath);
    throw error;
  }
  refreshPortalViews();
  safeRedirect("/portal/billing", "Payment proof submitted for review");
}

export async function cancelTenantPaymentSubmissionAction(formData) {
  const tenant = await requireTenant();
  const submissionId = integer(formData, "submissionId");
  const submission = get("SELECT * FROM payment_submissions WHERE id=$submissionId AND tenant_id=$tenantId", { submissionId, tenantId: tenant.tenant_id });
  if (!submission || submission.status !== "pending") throw new Error("Submission cannot be cancelled");
  transaction(() => {
    run("UPDATE payment_submissions SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=$submissionId AND status='pending'", { submissionId });
    recordAudit({ tenantActor: tenant, action: "status", entityType: "payment_submission", entityId: submissionId, propertyId: submission.property_id, summary: `${tenant.full_name} cancelled a payment submission` });
  });
  refreshPortalViews();
  safeRedirect("/portal/billing", "Payment submission cancelled");
}

export async function reviewPaymentSubmissionAction(formData) {
  const actor = await requireUser();
  const submissionId = integer(formData, "submissionId");
  const decision = choice(formData, "decision", ["approved", "rejected"]);
  const reviewNote = limitedText(formData, "reviewNote", 1200);
  if (decision === "rejected" && !reviewNote) throw new Error("Add a reason when rejecting payment proof");
  const submission = get("SELECT * FROM payment_submissions WHERE id=$submissionId", { submissionId });
  if (!submission || !canAccessProperty(actor, submission.property_id)) throw new Error("Submission access denied");

  transaction(() => {
    const current = get("SELECT * FROM payment_submissions WHERE id=$submissionId", { submissionId });
    if (!current || current.status !== "pending") throw new Error("Submission was already reviewed");
    let paymentId = null;
    if (decision === "approved") {
      const invoice = get("SELECT * FROM invoices WHERE id=$invoiceId AND property_id=$propertyId", { invoiceId: current.invoice_id, propertyId: current.property_id });
      if (!invoice || ["paid", "void"].includes(invoice.status)) throw new Error("Invoice cannot receive this payment");
      const balance = Number(invoice.amount) - Number(invoice.amount_paid);
      if (Number(current.amount) > balance + 0.001) throw new Error("Payment now exceeds the invoice balance");
      const reference = uid("PAY");
      const result = run(
        `INSERT INTO payments (property_id,invoice_id,tenant_id,reference,amount,method,paid_at,proof_path,notes,recorded_by)
         VALUES ($propertyId,$invoiceId,$tenantId,$reference,$amount,$method,$paidAt,$proofPath,$notes,$recordedBy)`,
        {
          propertyId: current.property_id,
          invoiceId: current.invoice_id,
          tenantId: current.tenant_id,
          reference,
          amount: current.amount,
          method: current.method,
          paidAt: current.paid_at,
          proofPath: current.proof_path,
          notes: [current.notes, current.external_reference ? `Tenant reference: ${current.external_reference}` : ""].filter(Boolean).join(" · "),
          recordedBy: actor.id
        }
      );
      paymentId = Number(result.lastInsertRowid);
      const newPaid = Number(invoice.amount_paid) + Number(current.amount);
      const newStatus = newPaid >= Number(invoice.amount) ? "paid" : "part_paid";
      run("UPDATE invoices SET amount_paid=$newPaid,status=$newStatus,updated_at=CURRENT_TIMESTAMP WHERE id=$invoiceId", { newPaid, newStatus, invoiceId: current.invoice_id });
    }
    run(
      `UPDATE payment_submissions SET status=$decision,review_note=$reviewNote,reviewed_by=$reviewedBy,
       reviewed_at=CURRENT_TIMESTAMP,payment_id=$paymentId,updated_at=CURRENT_TIMESTAMP WHERE id=$submissionId`,
      { decision, reviewNote, reviewedBy: actor.id, paymentId, submissionId }
    );
    recordAudit({ actor, action: decision === "approved" ? "record" : "status", entityType: "payment_submission", entityId: submissionId, propertyId: current.property_id, summary: `${decision === "approved" ? "Approved" : "Rejected"} tenant payment submission`, metadata: { amount: current.amount, invoiceId: current.invoice_id, paymentId } });
  });
  refreshPortalViews();
  safeRedirect("/tenant-portal", `Payment submission ${decision}`);
}
