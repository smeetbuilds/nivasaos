import Link from "next/link";
import { recordPaymentAction } from "@/app/actions";
import { all } from "@/lib/db";
import { money, dateLabel, today } from "@/lib/format";
import { extensions } from "@/lib/extensions";
import { permissionScopeSql, requirePortfolioPermission } from "@/lib/permissions";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import StatefulForm from "@/components/StatefulForm";
import Flash from "@/components/Flash";
import Empty from "@/components/Empty";
import Icon from "@/components/Icon";

export const metadata = { title: "Payments" };

function groupedMoney(rows) {
  const groups = [...rows.reduce((map, row) => map.set(row.currency, (map.get(row.currency) || 0) + Number(row.amount || 0)), new Map()).entries()];
  return {
    label: groups.length === 0 ? money(0) : groups.length === 1 ? money(groups[0][1], groups[0][0]) : `${groups.length} currencies`,
    detail: groups.length ? groups.map(([currency, amount]) => money(amount, currency)).join(" · ") : "No collections recorded"
  };
}

export default async function PaymentsPage({ searchParams }) {
  const user = await requirePortfolioPermission("payments.manage");
  const scope = permissionScopeSql(user, "payments.manage", "p");
  const properties = all(`SELECT p.* FROM properties p WHERE ${scope.clause} ORDER BY p.name`, scope.params);
  const rows = all(`SELECT pay.*,p.name property_name,p.currency,t.full_name tenant_name,i.number invoice_number,u.name recorder_name FROM payments pay JOIN properties p ON p.id=pay.property_id LEFT JOIN tenants t ON t.id=pay.tenant_id LEFT JOIN invoices i ON i.id=pay.invoice_id LEFT JOIN users u ON u.id=pay.recorded_by WHERE ${scope.clause} ORDER BY pay.paid_at DESC,pay.id DESC`, scope.params);
  const invoices = all(`SELECT i.id,i.number,i.property_id,p.name property_name,p.currency,t.full_name tenant_name,(i.amount-i.amount_paid) balance FROM invoices i JOIN properties p ON p.id=i.property_id LEFT JOIN tenants t ON t.id=i.tenant_id WHERE ${scope.clause} AND i.status NOT IN ('paid','void') AND i.amount>i.amount_paid ORDER BY i.due_date`, scope.params);
  const tenants = all(`SELECT t.id,t.full_name,t.property_id,p.name property_name FROM tenants t JOIN properties p ON p.id=t.property_id WHERE ${scope.clause} ORDER BY p.name,t.full_name`, scope.params);
  const methods = [...extensions.paymentMethods.values()];
  const query = await searchParams;
  const filters = {
    q: String(query?.q || "").trim().toLowerCase(),
    property: String(query?.property || ""),
    method: String(query?.method || ""),
    allocation: ["allocated", "unallocated"].includes(String(query?.allocation || "")) ? String(query?.allocation || "") : ""
  };
  const methodOptions = [...new Map([
    ...methods.map((method) => [method.id, method.label]),
    ...rows.filter((row) => row.method).map((row) => [row.method, String(row.method).replaceAll("_", " ")])
  ]).entries()].map(([id, label]) => ({ id, label }));
  const filteredRows = rows.filter((row) => {
    const haystack = `${row.reference} ${row.tenant_name || ""} ${row.invoice_number || ""} ${row.property_name} ${row.method || ""} ${row.recorder_name || ""}`.toLowerCase();
    const allocationMatches = !filters.allocation || (filters.allocation === "allocated" ? Boolean(row.invoice_id) : !row.invoice_id);
    return (!filters.q || haystack.includes(filters.q)) && (!filters.property || String(row.property_id) === filters.property) && (!filters.method || row.method === filters.method) && allocationMatches;
  });
  const collection = groupedMoney(rows);
  const allocatedCount = rows.filter((row) => Boolean(row.invoice_id)).length;
  const proofCount = rows.filter((row) => Boolean(row.proof_path)).length;

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Collections control" title="Payments" description="Record and reconcile offline or gateway collections, retain evidence, and keep invoice balances accurate inside your property scope." actions={<OpenModalButton target="payment-modal" icon="plus">Record payment</OpenModalButton>}/>

    <section className="metric-grid finance-summary-grid" aria-label="Payment collection summary">
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="payment"/></div><span>Payments recorded</span><strong>{rows.length}</strong><small>Inside your permitted property scope</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="report"/></div><span>Collected</span><strong>{collection.label}</strong><small>{collection.detail}</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="invoice"/></div><span>Invoice allocated</span><strong>{allocatedCount}</strong><small>{rows.length ? Math.round(allocatedCount / rows.length * 100) : 0}% of payment records</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="document"/></div><span>Proof attached</span><strong>{proofCount}</strong><small>{rows.length ? Math.round(proofCount / rows.length * 100) : 0}% evidence coverage</small></article>
    </section>

    {rows.length > 0 && <form className="panel finance-toolbar" method="get" aria-label="Filter payments">
      <div className="finance-toolbar-copy"><span className="eyebrow">Collections ledger</span><strong>Payment directory</strong><small>{filteredRows.length} of {rows.length} payments shown</small></div>
      <div className="finance-filter-grid payment-filter-grid">
        <label className="finance-search-field"><span>Search</span><input type="search" name="q" defaultValue={query?.q || ""} placeholder="Reference, person, invoice, or property"/></label>
        <label><span>Property</span><select name="property" defaultValue={filters.property}><option value="">All properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
        <label><span>Method</span><select name="method" defaultValue={filters.method}><option value="">All methods</option>{methodOptions.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}</select></label>
        <label><span>Allocation</span><select name="allocation" defaultValue={filters.allocation}><option value="">Any allocation</option><option value="allocated">Invoice allocated</option><option value="unallocated">Unallocated</option></select></label>
        <div className="finance-filter-actions"><button className="button secondary" type="submit">Apply</button><Link href="/payments" className="text-link">Reset</Link></div>
      </div>
    </form>}

    {filteredRows.length ? <div className="panel directory-panel finance-directory-panel"><div className="table-wrap"><table className="finance-table payments-table"><thead><tr><th>Reference</th><th>Person / invoice</th><th>Property</th><th>Paid on</th><th>Method</th><th>Amount</th><th>Evidence</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.id}>
      <td><strong>{row.reference}</strong><small>Recorded by {row.recorder_name || "System"}</small></td>
      <td><strong>{row.tenant_name || "Unassigned"}</strong><small>{row.invoice_number || "Unallocated payment"}</small></td>
      <td><strong>{row.property_name}</strong><small>{row.invoice_id ? "Reconciled to invoice" : "Needs allocation review"}</small></td>
      <td><strong>{dateLabel(row.paid_at)}</strong></td>
      <td><span className="finance-method">{String(row.method || "other").replaceAll("_", " ")}</span></td>
      <td><strong className="finance-amount">{money(row.amount, row.currency)}</strong></td>
      <td>{row.proof_path ? <a className="text-link" href={`/api/proofs/${row.id}`} target="_blank">View proof</a> : <span className="muted">No proof</span>}</td>
    </tr>)}</tbody></table></div></div> : rows.length ? <Empty icon="payment" title="No payments match these filters" text="Adjust the search, property, method, or allocation filters to view more collections."/> : <Empty icon="payment" title="No payments recorded" text="Record a payment and optionally attach a receipt, transfer screenshot, or PDF proof."/>}

    <StatefulForm action={recordPaymentAction}><ModalForm id="payment-modal" title="Record a payment" description="Invoice-linked payments update invoice status and outstanding balance automatically." submitLabel="Record payment" pendingLabel="Recording…"><div className="modal-body"><label><span>Property</span><select name="propertyId" required>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><div className="field-grid two"><label><span>Invoice (optional)</span><select name="invoiceId"><option value="">Unallocated payment</option>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.property_name} · {invoice.number} · {invoice.tenant_name || "Unassigned"} · {money(invoice.balance, invoice.currency)}</option>)}</select></label><label><span>Person (optional)</span><select name="tenantId"><option value="">Unassigned</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.property_name} · {tenant.full_name}</option>)}</select></label></div><div className="field-grid three"><label><span>Amount</span><input name="amount" type="number" min="0.01" step="0.01" required/></label><label><span>Method</span><select name="method">{methods.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}</select></label><label><span>Paid date</span><input name="paidAt" type="date" defaultValue={today()} required/></label></div><label><span>Payment proof</span><input type="file" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf"/><small>JPG, PNG, WebP, or PDF up to 5 MB. Files must be reselected after server rejection.</small></label><label><span>Notes</span><textarea name="notes" rows="3"/></label></div></ModalForm></StatefulForm>
  </>;
}
