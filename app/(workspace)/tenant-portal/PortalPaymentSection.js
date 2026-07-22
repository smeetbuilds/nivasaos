import Link from "next/link";
import { reviewPaymentSubmissionAction } from "@/app/actions";
import { dateLabel, dateTimeLabel, money } from "@/lib/format";
import Badge from "@/components/Badge";
import ConfirmAction from "@/components/ConfirmAction";
import Empty from "@/components/Empty";
import ModalForm from "@/components/ModalForm";
import OpenModalButton from "@/components/OpenModalButton";

export default function PortalPaymentSection({ canReviewPayments, pending, submissions }) {
  if (!canReviewPayments) return null;
  return <>
    <section className="panel portal-review-panel portal-admin-section" aria-labelledby="portal-payment-review-title">
      <div className="panel-head"><div><span className="eyebrow">Controlled reconciliation</span><h2 id="portal-payment-review-title">Tenant payment submissions</h2></div><Badge tone={pending.length ? "overdue" : "paid"}>{pending.length ? `${pending.length} pending` : "Queue clear"}</Badge></div>
      {submissions.length ? <div className="table-wrap"><table className="portal-admin-table" data-mobile-cards="portal-submissions" aria-label="Tenant payment submissions"><thead><tr><th>Submitted</th><th>Tenant / invoice</th><th>Amount</th><th>Payment details</th><th>Status</th><th>Review</th></tr></thead><tbody>{submissions.map((item) => <tr key={item.id}>
        <td data-label="Submitted"><strong>{dateTimeLabel(item.created_at)}</strong><small>Paid {dateLabel(item.paid_at)}</small></td>
        <td data-label="Tenant / invoice"><strong>{item.tenant_name}</strong><small>{item.invoice_number || "No invoice"} · {item.property_name}</small></td>
        <td data-label="Amount"><strong>{money(item.amount, item.currency)}</strong><small>{item.invoice_number ? `${money(item.invoice_balance, item.currency)} current balance` : "Unallocated submission"}</small></td>
        <td data-label="Payment details"><strong>{item.method.replaceAll("_", " ")}</strong><small>{item.external_reference || "No external reference"}</small><a href={`/api/payment-submissions/${item.id}/proof`} className="text-link" target="_blank" rel="noreferrer">View proof</a></td>
        <td data-label="Status"><Badge tone={item.status}>{item.status}</Badge>{item.review_note && <small>{item.review_note}</small>}</td>
        <td data-label="Review">{item.status === "pending" ? <div className="table-actions portal-review-actions"><ConfirmAction action={reviewPaymentSubmissionAction} id={`approve-submission-${item.id}`} triggerLabel="Approve" triggerClassName="button primary small" title={`Approve ${item.tenant_name}'s payment?`} description={`${item.invoice_number || "Unallocated submission"} · ${item.property_name}`} submitLabel="Approve and record" pendingLabel="Approving…"><div className="modal-body"><input type="hidden" name="submissionId" value={item.id}/><input type="hidden" name="decision" value="approved"/><div className="summary-box"><span>Payment submission</span><strong>{money(item.amount, item.currency)} · {item.method.replaceAll("_", " ")}</strong><small>{item.external_reference || "No external reference"}</small></div><div className="confirm-consequence">Approval creates an official payment record and updates the linked invoice balance after live balance validation.</div></div></ConfirmAction><OpenModalButton target={`reject-submission-${item.id}`} className="button secondary small">Reject</OpenModalButton></div> : item.payment_id ? <Link className="text-link" href={`/api/proofs/${item.payment_id}`} target="_blank" rel="noreferrer">Approved proof</Link> : <span className="muted">Reviewed</span>}</td>
      </tr>)}</tbody></table></div> : <Empty icon="payment" title="No tenant payment submissions" text="No submitted proofs are available within your payment-review scope."/>}
    </section>

    {pending.map((item) => <form action={reviewPaymentSubmissionAction} key={`reject-${item.id}`}><ModalForm id={`reject-submission-${item.id}`} title={`Reject ${item.tenant_name}'s submission`} description="The proof remains in history, but no payment is created and the invoice balance is unchanged." submitLabel="Reject submission" pendingLabel="Rejecting…"><div className="modal-body"><input type="hidden" name="submissionId" value={item.id}/><input type="hidden" name="decision" value="rejected"/><div className="summary-box"><span>Submission</span><strong>{money(item.amount, item.currency)} · {item.invoice_number || "No invoice"}</strong><small>{item.external_reference || "No external reference"}</small></div><label><span>Reason visible to tenant</span><textarea name="reviewNote" rows="4" required placeholder="Example: The transfer reference could not be matched. Please upload a clearer proof."/></label></div></ModalForm></form>)}
  </>;
}
