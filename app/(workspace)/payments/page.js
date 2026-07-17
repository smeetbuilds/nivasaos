import { recordPaymentAction } from "@/app/actions";
import { all } from "@/lib/db";
import { money, dateLabel, today } from "@/lib/format";
import { extensions } from "@/lib/extensions";
import { permissionScopeSql, requirePortfolioPermission } from "@/lib/permissions";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Empty from "@/components/Empty";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }) {
  const user = await requirePortfolioPermission("payments.manage");
  const scope = permissionScopeSql(user, "payments.manage", "p");
  const properties = all(`SELECT p.* FROM properties p WHERE ${scope.clause} ORDER BY p.name`, scope.params);
  const rows = all(`SELECT pay.*,p.name property_name,p.currency,t.full_name tenant_name,i.number invoice_number,u.name recorder_name FROM payments pay JOIN properties p ON p.id=pay.property_id LEFT JOIN tenants t ON t.id=pay.tenant_id LEFT JOIN invoices i ON i.id=pay.invoice_id LEFT JOIN users u ON u.id=pay.recorded_by WHERE ${scope.clause} ORDER BY pay.paid_at DESC,pay.id DESC`, scope.params);
  const invoices = all(`SELECT i.id,i.number,i.property_id,p.name property_name,p.currency,t.full_name tenant_name,(i.amount-i.amount_paid) balance FROM invoices i JOIN properties p ON p.id=i.property_id LEFT JOIN tenants t ON t.id=i.tenant_id WHERE ${scope.clause} AND i.status NOT IN ('paid','void') AND i.amount>i.amount_paid ORDER BY i.due_date`, scope.params);
  const tenants = all(`SELECT t.id,t.full_name,t.property_id,p.name property_name FROM tenants t JOIN properties p ON p.id=t.property_id WHERE ${scope.clause} ORDER BY p.name,t.full_name`, scope.params);
  const methods = [...extensions.paymentMethods.values()];
  const query = await searchParams;
  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Collections ledger" title="Payments" description="Record offline or gateway payments, attach proof, and reconcile invoice balances within your property scope." actions={<OpenModalButton target="payment-modal" icon="plus">Record payment</OpenModalButton>}/>
    {rows.length ? <div className="panel"><div className="table-wrap"><table><thead><tr><th>Reference</th><th>Tenant / invoice</th><th>Property</th><th>Paid on</th><th>Method</th><th>Amount</th><th>Proof</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.reference}</strong><small>Recorded by {row.recorder_name || "System"}</small></td><td>{row.tenant_name || "Unassigned"}<small>{row.invoice_number || "Unallocated payment"}</small></td><td>{row.property_name}</td><td>{dateLabel(row.paid_at)}</td><td>{row.method.replaceAll("_", " ")}</td><td><strong>{money(row.amount, row.currency)}</strong></td><td>{row.proof_path ? <a className="text-link" href={`/api/proofs/${row.id}`} target="_blank">View proof</a> : <span className="muted">None</span>}</td></tr>)}</tbody></table></div></div> : <Empty icon="payment" title="No payments recorded" text="Record a payment and optionally attach a receipt, transfer screenshot, or PDF proof."/>}
    <form action={recordPaymentAction}><ModalForm id="payment-modal" title="Record a payment" description="Invoice-linked payments update the invoice status and outstanding balance automatically." submitLabel="Record payment" pendingLabel="Recording…"><div className="modal-body"><label><span>Property</span><select name="propertyId" required>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><div className="field-grid two"><label><span>Invoice (optional)</span><select name="invoiceId"><option value="">Unallocated payment</option>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.property_name} · {invoice.number} · {invoice.tenant_name || "Unassigned"} · {money(invoice.balance, invoice.currency)}</option>)}</select></label><label><span>Tenant (optional)</span><select name="tenantId"><option value="">Unassigned</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.property_name} · {tenant.full_name}</option>)}</select></label></div><div className="field-grid three"><label><span>Amount</span><input name="amount" type="number" min="0.01" step="0.01" required/></label><label><span>Method</span><select name="method">{methods.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}</select></label><label><span>Paid date</span><input name="paidAt" type="date" defaultValue={today()} required/></label></div><label><span>Payment proof</span><input type="file" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf"/><small>JPG, PNG, WebP, or PDF up to 5 MB. Stored on this server.</small></label><label><span>Notes</span><textarea name="notes" rows="3"/></label></div></ModalForm></form>
  </>;
}
