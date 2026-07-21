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
  return <>
    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">Refundable money</span><h2>Deposit transactions</h2></div><OpenModalButton target="deposit-modal" icon="plus" className="button secondary">Add transaction</OpenModalButton></div>
      {deposits.length ? <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Tenant / lease</th><th>Property / unit</th><th>Date</th><th>Type</th><th>Amount</th><th>Proof</th></tr></thead><tbody>{deposits.map((item) => <tr key={item.id}><td><strong>{item.reference}</strong></td><td>{item.tenant_name || "Lease-level"}<small>{item.lease_reference}</small></td><td>{item.property_name}<small>{item.unit_name}</small></td><td>{dateLabel(item.transacted_at)}</td><td><Badge tone={["received", "credit"].includes(item.transaction_type) ? "paid" : "overdue"}>{item.transaction_type}</Badge></td><td><strong>{heldSign(item.transaction_type) > 0 ? "+" : " "}{money(item.amount, item.currency)}</strong></td><td>{item.proof_path ? <a className="text-link" href={`/api/deposit-proofs/${item.id}`} target="_blank">View proof</a> : <span className="muted">None</span>}</td></tr>)}</tbody></table></div> : <Empty icon="deposit" title="No deposit activity" text="No deposit transactions are available within your deposit-management scope."/>}
    </section>

    <form action={recordDepositTransactionAction}><ModalForm id="deposit-modal" title="Record deposit transaction" description="Deposit records are separate from rent payments and remain visible to every tenant on the lease." submitLabel="Record transaction" pendingLabel="Recording…"><div className="modal-body">
      <label><span>Active lease</span><select name="leaseId" required><option value="">Select lease</option>{leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.property_name} · {lease.unit_name} · {lease.reference} · held {money(fromMinorUnits(Number(lease.held_minor || 0)), lease.currency)}</option>)}</select></label>
      <label><span>Tenant attribution (optional)</span><select name="tenantId"><option value="">Lease-level transaction</option>{depositTenants.filter((tenant) => tenant.active_lease_id).map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.full_name} · {tenant.property_name} · {tenant.unit_name}</option>)}</select><small>The server verifies the tenant belongs to the selected lease.</small></label>
      <div className="field-grid two"><label><span>Transaction type</span><select name="transactionType"><option value="received">Deposit received</option><option value="refund">Deposit refund</option><option value="credit">Credit adjustment</option><option value="debit">Debit adjustment</option></select></label><label><span>Amount</span><input name="amount" type="number" min="0.01" step="0.01" required/></label></div>
      <div className="field-grid two"><label><span>Method</span><select name="method">{methods.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}</select></label><label><span>Transaction date</span><input name="transactedAt" type="date" defaultValue={today()} required/></label></div>
      <label><span>Proof (optional)</span><input type="file" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf"/><small>JPG, PNG, WebP, or PDF up to 5 MB.</small></label><label><span>Notes</span><textarea name="notes" rows="3" placeholder="Refund reason, bank reference, deduction explanation, or handover note"/></label>
    </div></ModalForm></form>
  </>;
}
