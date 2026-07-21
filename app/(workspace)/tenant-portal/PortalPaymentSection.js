import Link from "next/link";
import { reviewPaymentSubmissionAction } from "@/app/actions";
import { dateLabel, dateTimeLabel, money } from "@/lib/format";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import ModalForm from "@/components/ModalForm";
import OpenModalButton from "@/components/OpenModalButton";

export default function PortalPaymentSection({ canReviewPayments, pending, submissions }) {
  if (!canReviewPayments) return null;
  return <>
    <section className="panel portal-review-panel">
      <div className="panel-head"><div><span className="eyebrow">Controlled reconciliation</span><h2>Tenant payment submissions</h2></div><Badge tone={pending.length ? "overdue" : "paid"}>{pending.length ? `${pending.length} pending` : "Queue clear"}</Badge></div>
      {submissions.length ? <div className="table-wrap"><table><thead><tr><th>Submitted</th><th>Tenant / invoice</th><th>Amount</th><th>Payment details</th><th>Status</th><th>Review</th></tr></thead><tbody>{submissions.map((item) => <tr key={item.id}>
        <td>{dateTimeLabel(item.created_at)}<small>Paid {dateLabel(item.paid_at)}</small></td>
        <td><strong>{item.tenant_name}</strong><small>{item.invoice_number || "No invoice"} · {item.property_name}</small></td>
        <td><strong>{money(item.amount, item.currency)}</strong><small>{item.invoice_number ? `${money(item.invoice_balance, item.currency)} current balance` : ""}</small></td>
        <td>{item.method.replaceAll("_", " ")}<small>{item.external_reference || "No external reference"}</small><a href={`/api/payment-submissions/${item.id}/proof`} className="text-link" target="_blank">View proof</a></td>
        <td><Badge tone={item.status}>{item.status}</Badge>{item.review_note && <small>{item.review_note}</small>}</td>
        <td>{item.status === "pending" ? <div className="table-actions"><form action={reviewPaymentSubmissionAction}><input type="hidden" name="submissionId" value={item.id}/><input type="hidden" name="decision" value="approved"/><button className="text-button">Approve</button></form><OpenModalButton target={`reject-submission-${item.id}`} className="text-button danger-text">Reject</OpenModalButton></div> : item.payment_id ? <Link className="text-link" href={`/api/proofs/${item.payment_id}`} target="_blank">Approved proof</Link> : <span className="muted">Reviewed</span>}</td>
      </tr>)}</tbody></table></div> : <Empty icon="payment" title="No tenant payment submissions" text="No submitted proofs are available within your payment-review scope."/>}
    </section>

    {pending.map((item) => <form action={reviewPaymentSubmissionAction} key={`reject-${item.id}`}><ModalForm id={`reject-submission-${item.id}`} title={`Reject ${item.tenant_name}'s submission`} description="The proof remains in history, but no payment is created and the invoice balance is unchanged." submitLabel="Reject submission" pendingLabel="Rejecting…"><div className="modal-body"><input type="hidden" name="submissionId" value={item.id}/><input type="hidden" name="decision" value="rejected"/><div className="summary-box"><span>Submission</span><strong>{money(item.amount, item.currency)} · {item.invoice_number}</strong><small>{item.external_reference || "No external reference"}</small></div><label><span>Reason visible to tenant</span><textarea name="reviewNote" rows="4" required placeholder="Example: The transfer reference could not be matched. Please upload a clearer proof."/></label></div></ModalForm></form>)}
  </>;
}
