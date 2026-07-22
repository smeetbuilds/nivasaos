import { recordDepositTransactionAction } from "@/app/actions";
import { dateLabel, money, today } from "@/lib/format";
import { fromMinorUnits } from "@/lib/money";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import ModalForm from "@/components/ModalForm";
import OpenModalButton from "@/components/OpenModalButton";

function heldSign(type) {
  return ["received", "credit"].includes(type) ? 1 : -1;
}

export default function PortalDepositSection({ canManageDeposits, deposits, leases, depositTenants, methods }) {
  if (!canManageDeposits) return null;
  const canRecord = leases.length > 0;
  return <>
    <section className="panel portal-admin-section" aria-labelledby="portal-deposit-ledger-title">
      <div className="panel-head"><div><span className="eyebrow">Refundable money</span><h2 id="portal-deposit-ledger-title">Deposit transactions</h2></div>{canRecord ? <OpenModalButton target="deposit-modal" icon="plus" className="button secondary">Add transaction</OpenModalButton> : <span className="panel-count">No active agreements</span>}</div>
      {deposits.length ? <div className="table-wrap"><table className="portal-admin-table" data-mobile-cards="portal-deposits" aria-label="Deposit transaction ledger"><thead><tr><th>Reference</th><th>Tenant / lease</th><th>Property / unit</th><th>Date</th><th>Type</th><th>Amount</th><th>Proof</th></tr></thead><tbody>{deposits.map((item) => {
        const sign = heldSign(item.transaction_type);
        return <tr key={item.id}>
          <td data-label="Reference"><strong>{item.reference}</strong></td>
          <td data-label="Tenant / lease"><strong>{item.tenant_name || "Lease-level"}</strong><small>{item.lease_reference}</small></td>
          <td data-label="Property / unit"><strong>{item.property_name}</strong><small>{item.unit_name}</small></td>
          <td data-label="Date"><strong>{dateLabel(item.transacted_at)}</strong></td>
          <td data-label="Type"><Badge tone={sign > 0 ? "paid" : "overdue"}>{item.transaction_type.replaceAll("_", " ")}</Badge></td>
          <td data-label="Amount"><strong className={sign > 0 ? "portal-positive-amount" : "portal-negative-amount"}>{sign > 0 ? "+" : "−"}{money(item.amount, item.currency)}</strong></td>
          <td data-label="Proof">{item.proof_path ? <a className="text-link" href={`/api/deposit-proofs/${item.id}`} target="_blank" rel="noreferrer">View proof</a> : <span className="muted">No proof</span>}</td>
        </tr>;
      })}</tbody></table></div> : <Empty icon="deposit" title="No deposit activity" text={canRecord ? "Record a deposit receipt, refund, credit, or debit to begin the refundable-money ledger." : "An active agreement is required before a deposit transaction can be recorded."}/>} 
    </section>

    {canRecord && <form action={recordDepositTransactionAction}><ModalForm id="deposit-modal" title="Record deposit transaction" description="Deposit records are separate from rent payments and remain visible to every tenant on the lease." submitLabel="Record transaction" pendingLabel="Recording…"><div className="modal-body">
      <label><span>Active lease</span><select name="leaseId" required><option value="">Select lease</option>{leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.property_name} · {lease.unit_name} · {lease.reference} · held {money(fromMinorUnits(Number(lease.held_minor || 0)), lease.currency)}</option>)}</select></label>
      <label><span>Tenant attribution (optional)</span><select name="tenantId"><option value="">Lease-level transaction</option>{depositTenants.filter((tenant) => tenant.active_lease_id).map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.full_name} · {tenant.property_name} · {tenant.unit_name}</option>)}</select><small>The server verifies the tenant belongs to the selected lease.</small></label>
      <div className="field-grid two"><label><span>Transaction type</span><select name="transactionType"><option value="received">Deposit received</option><option value="refund">Deposit refund</option><option value="credit">Credit adjustment</option><option value="debit">Debit adjustment</option></select></label><label><span>Amount</span><input name="amount" type="number" min="0.01" step="0.01" required/></label></div>
      <div className="field-grid two"><label><span>Method</span><select name="method">{methods.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}</select></label><label><span>Transaction date</span><input name="transactedAt" type="date" defaultValue={today()} required/></label></div>
      <label><span>Proof (optional)</span><input type="file" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf"/><small>JPG, PNG, WebP, or PDF up to 5 MB.</small></label><label><span>Notes</span><textarea name="notes" rows="3" placeholder="Refund reason, bank reference, deduction explanation, or handover note"/></label>
    </div></ModalForm></form>}
  </>;
}
