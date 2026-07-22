import Link from "next/link";
import { cancelTenantPaymentSubmissionAction, submitTenantPaymentAction } from "@/app/actions";
import { requireTenant } from "@/lib/tenant-auth";
import { portalBillingData } from "@/lib/portal-data";
import { dateLabel, dateTimeLabel, money, today } from "@/lib/format";
import { extensions } from "@/lib/extensions";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import ConfirmAction from "@/components/ConfirmAction";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Icon from "@/components/Icon";

export const metadata = { title: "Billing & receipts" };

export default async function PortalBillingPage({ searchParams }) {
  const tenant = await requireTenant();
  const data = portalBillingData(tenant.tenant_id);
  const query = await searchParams;
  const payable = data.invoices.filter((invoice) => {
    const available = Number(invoice.amount) - Number(invoice.amount_paid) - Number(invoice.pending_amount || 0);
    return !["paid", "void"].includes(invoice.status) && available > 0.001;
  });
  const methods = [...extensions.paymentMethods.values()].filter((method) => ["bank_transfer", "upi", "cash", "card", "other"].includes(method.id));
  const outstanding = data.invoices.reduce((map, invoice) => {
    if (!["paid", "void"].includes(invoice.status)) map.set(invoice.currency, (map.get(invoice.currency) || 0) + Number(invoice.amount) - Number(invoice.amount_paid));
    return map;
  }, new Map());
  const outstandingLabel = outstanding.size === 0 ? money(0) : outstanding.size === 1 ? money([...outstanding.values()][0], [...outstanding.keys()][0]) : `${outstanding.size} currencies`;
  const pendingCount = data.submissions.filter((item) => item.status === "pending").length;
  const openInvoiceCount = data.invoices.filter((invoice) => !["paid", "void"].includes(invoice.status)).length;

  return <>
    <Flash searchParams={query}/>
    <header className="portal-page-head"><div><span className="eyebrow">Billing history</span><h1>Invoices, payments, and receipts</h1><p>Payment proofs remain pending until the property team approves them. Your invoice balance changes only after approval.</p></div>{payable.length > 0 && <OpenModalButton target="portal-payment-modal" icon="payment">Submit payment proof</OpenModalButton>}</header>

    <section className="portal-metric-grid portal-billing-metrics" aria-label="Resident billing summary">
      <article className={openInvoiceCount ? "is-risk" : ""}><span>Outstanding balance</span><strong>{outstandingLabel}</strong><small>Across issued and part-paid invoices</small></article>
      <article><span>Invoices</span><strong>{data.invoices.length}</strong><small>Including paid and historical charges</small></article>
      <article><span>Recorded payments</span><strong>{data.payments.length}</strong><small>Each has a printable receipt</small></article>
      <article className={pendingCount ? "is-risk" : ""}><span>Submissions pending</span><strong>{pendingCount}</strong><small>Reserved from duplicate proof submissions</small></article>
    </section>

    <section className="portal-card" aria-labelledby="portal-invoices-title">
      <div className="portal-card-head"><div><span className="eyebrow">What you owe</span><h2 id="portal-invoices-title">Invoices</h2></div>{payable.length > 0 && <OpenModalButton target="portal-payment-modal" className="button secondary" icon="plus">Submit proof</OpenModalButton>}</div>
      {data.invoices.length ? <div className="portal-invoice-list">{data.invoices.map((invoice) => {
        const balance = Number(invoice.amount) - Number(invoice.amount_paid);
        const pending = Number(invoice.pending_amount || 0);
        const available = Math.max(0, balance - pending);
        const overdue = !["paid", "void"].includes(invoice.status) && invoice.due_date < today();
        const titleId = `portal-invoice-${invoice.id}`;
        return <article key={invoice.id} className={`portal-invoice-card${overdue ? " is-overdue" : ""}`} aria-labelledby={titleId}>
          <div><span className="portal-invoice-icon"><Icon name={invoice.charge_type === "rent" ? "home" : invoice.charge_type === "late_fee" ? "billing" : "receipt"} size={20}/></span><span><strong id={titleId}>{invoice.number}</strong><small>{invoice.description} · {invoice.property_name}{invoice.unit_name ? ` · ${invoice.unit_name}` : ""}</small></span></div>
          <div className="portal-invoice-money"><strong>{money(balance, invoice.currency)}</strong><small>of {money(invoice.amount, invoice.currency)}</small></div>
          <div><span>Due {dateLabel(invoice.due_date)}</span>{pending > 0 && <small>{money(pending, invoice.currency)} proof pending</small>}{available > 0 && pending > 0 && <small>{money(available, invoice.currency)} still available to submit</small>}</div>
          <Badge tone={overdue ? "overdue" : invoice.status}>{overdue ? "overdue" : invoice.status.replaceAll("_", " ")}</Badge>
        </article>;
      })}</div> : <div className="portal-empty-state"><Icon name="receipt" size={28}/><strong>No invoices yet</strong><p>Rent and other charges will appear here when issued.</p></div>}
    </section>

    <section className="portal-card" aria-labelledby="portal-submissions-title">
      <div className="portal-card-head"><div><span className="eyebrow">Review queue</span><h2 id="portal-submissions-title">Proof submissions</h2></div><Badge tone={pendingCount ? "pending" : "paid"}>{pendingCount ? `${pendingCount} pending` : "Queue clear"}</Badge></div>
      {data.submissions.length ? <div className="portal-submission-list">{data.submissions.map((item) => <article key={item.id} aria-label={`${item.status} payment proof submission`}><span className="portal-submission-status"><Badge tone={item.status}>{item.status}</Badge></span><span><strong>{money(item.amount, item.currency)}</strong><small>{item.invoice_number || "No invoice"} · submitted {dateTimeLabel(item.created_at)}</small></span><span><strong>{item.method.replaceAll("_", " ")}</strong><small>{item.external_reference || "No reference"}</small></span><div className="portal-submission-actions"><a href={`/portal/proofs/submissions/${item.id}`} target="_blank" rel="noreferrer" className="text-link">View proof</a>{item.status === "approved" && item.payment_id && <Link href={`/portal/receipts/${item.payment_id}`} className="text-link">Receipt</Link>}{item.status === "pending" && <ConfirmAction action={cancelTenantPaymentSubmissionAction} id={`cancel-portal-submission-${item.id}`} triggerLabel="Cancel submission" triggerClassName="text-button danger" title="Cancel this payment proof submission?" description={`${item.invoice_number || "No invoice"} · ${money(item.amount, item.currency)}`} submitLabel="Cancel submission" pendingLabel="Cancelling…"><div className="modal-body"><input type="hidden" name="submissionId" value={item.id}/><div className="confirm-consequence">The proof remains in audit history, but its reserved amount is released so a corrected submission can be made.</div></div></ConfirmAction>}</div>{item.review_note && <p>{item.review_note}</p>}</article>)}</div> : <div className="portal-empty-state compact"><strong>No proof submissions</strong><p>Use “Submit payment proof” after paying an invoice outside the portal.</p></div>}
    </section>

    <section className="portal-card" aria-labelledby="portal-receipts-title">
      <div className="portal-card-head"><div><span className="eyebrow">Official ledger</span><h2 id="portal-receipts-title">Payment receipts</h2></div></div>
      {data.payments.length ? <div className="portal-activity-list portal-payment-list">{data.payments.map((payment) => <Link href={`/portal/receipts/${payment.id}`} key={payment.id}><span className="portal-activity-icon"><Icon name="receipt" size={18}/></span><span><strong>{payment.reference}</strong><small>{payment.invoice_number || "Unallocated payment"} · {dateLabel(payment.paid_at)} · {payment.method.replaceAll("_", " ")}{payment.payer_name && payment.payer_name !== tenant.full_name ? ` · paid by ${payment.payer_name}` : ""}</small></span><strong>{money(payment.amount, payment.currency)}</strong><Icon name="arrow" size={16}/></Link>)}</div> : <div className="portal-empty-state compact"><strong>No approved payments</strong><p>Receipts are created after the property team records or approves payment.</p></div>}
    </section>

    {payable.length > 0 && <form action={submitTenantPaymentAction}><ModalForm id="portal-payment-modal" title="Submit payment proof" description="This does not mark an invoice paid. Staff review the proof and then create the official payment receipt." submitLabel="Submit for review" pendingLabel="Uploading…"><div className="modal-body">
      <label><span>Invoice</span><select name="invoiceId" required><option value="">Select invoice</option>{payable.map((invoice) => { const available = Number(invoice.amount) - Number(invoice.amount_paid) - Number(invoice.pending_amount || 0); return <option value={invoice.id} key={invoice.id}>{invoice.number} · {invoice.description} · available {money(available, invoice.currency)}</option>; })}</select></label>
      <div className="field-grid two"><label><span>Amount paid</span><input name="amount" type="number" min="0.01" step="0.01" required/></label><label><span>Payment date</span><input name="paidAt" type="date" defaultValue={today()} required/></label></div>
      <div className="field-grid two"><label><span>Method</span><select name="method">{methods.map((method) => <option value={method.id} key={method.id}>{method.label}</option>)}</select></label><label><span>Bank / UPI reference</span><input name="externalReference" placeholder="UTR, transaction ID, or receipt number"/></label></div>
      <label><span>Payment proof</span><input type="file" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf" required/><small>Required. JPG, PNG, WebP, or PDF up to 5 MB.</small></label>
      <label><span>Note to property team</span><textarea name="notes" rows="3" placeholder="Any detail that helps match this payment"/></label>
      <div className="policy-warning">Never submit card PINs, OTPs, passwords, or complete bank statements.</div>
    </div></ModalForm></form>}
  </>;
}
