import Link from "next/link";
import { voidInvoiceAction } from "@/app/actions";
import { money, dateLabel, today } from "@/lib/format";
import { rentPeriodLabel } from "@/lib/rent";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import WhatsAppButton from "@/components/WhatsAppButton";
import ConfirmAction from "@/components/ConfirmAction";

export default function InvoiceTable({ workspace }) {
  const { rows, properties, propertyId, status, charge, search, template, driver } = workspace;
  const showActions = rows.some((row) => row.canManageBilling);
  const filtersActive = Boolean(search || propertyId || status !== "all" || charge !== "all");

  return <>
    <form method="get" className="panel finance-toolbar invoice-finance-toolbar" aria-label="Filter invoices">
      <div className="finance-toolbar-copy"><span className="eyebrow">Receivables register</span><strong>Invoice directory</strong><small aria-live="polite">{rows.length} invoice{rows.length === 1 ? "" : "s"} shown</small></div>
      <div className="finance-filter-grid invoice-finance-filter-grid">
        <label className="finance-search-field"><span>Search invoices</span><input type="search" name="search" defaultValue={search} placeholder="Invoice, tenant, agreement, or unit"/></label>
        <label><span>Property</span><select name="property" defaultValue={propertyId || ""}><option value="">All permitted properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
        <label><span>Status</span><select name="status" defaultValue={status}><option value="all">All statuses</option><option value="open">Open</option><option value="overdue">Overdue</option><option value="issued">Issued</option><option value="part_paid">Part paid</option><option value="paid">Paid</option><option value="draft">Draft</option><option value="void">Void</option></select></label>
        <label><span>Charge</span><select name="charge" defaultValue={charge}><option value="all">All charges</option><option value="rent">Rent</option><option value="late_fee">Late fee</option><option value="manual">Manual</option></select></label>
        <div className="finance-filter-actions"><button className="button secondary" type="submit">Apply filters</button>{filtersActive && <Link className="text-link" href="/invoices">Reset</Link>}</div>
      </div>
    </form>

    {rows.length ? <section className="panel directory-panel finance-directory-panel" aria-label="Invoice directory results"><div className="table-wrap"><table className="finance-table invoices-table" data-mobile-cards="invoices" aria-label="Invoice directory"><thead><tr><th>Invoice</th><th>Charge</th><th>Tenant</th><th>Property / unit</th><th>Due</th><th>Amount</th><th>Balance</th><th>Status</th><th>Reminder</th>{showActions && <th>Actions</th>}</tr></thead><tbody>{rows.map((row) => {
      const overdue = !["paid", "void"].includes(row.status) && row.due_date < today();
      const balance = Number(row.amount) - Number(row.amount_paid);
      const message = template.replaceAll("{tenant}", row.tenant_name || "tenant").replaceAll("{invoice}", row.number).replaceAll("{balance}", money(balance, row.currency)).replaceAll("{due_date}", dateLabel(row.due_date));
      const prepared = driver.prepare({ recipient: row.phone, message });
      return <tr key={row.id} className={row.status === "void" ? "void-row" : ""}>
        <td data-label="Invoice"><strong>{row.number}</strong><small>{row.description}{row.rent_period ? ` · ${rentPeriodLabel(row.rent_period)}` : ""}</small></td>
        <td data-label="Charge"><Badge tone={row.charge_type}>{row.charge_type.replace("_", " ")}</Badge>{row.source_invoice_number && <small>For {row.source_invoice_number}</small>}</td>
        <td data-label="Tenant"><strong>{row.tenant_name || "Unassigned"}</strong><small>{row.lease_reference || "No agreement linked"}</small></td>
        <td data-label="Property / unit"><strong>{row.property_name}</strong><small>{row.unit_name || "No unit"}</small></td>
        <td data-label="Due"><strong>{dateLabel(row.due_date)}</strong><small>{overdue ? "Past due" : "Scheduled"}</small></td>
        <td data-label="Amount"><strong>{money(row.amount, row.currency)}</strong><small>{money(row.amount_paid, row.currency)} paid</small></td>
        <td data-label="Balance"><strong className={balance > 0 ? "finance-balance" : ""}>{money(balance, row.currency)}</strong></td>
        <td data-label="Status"><Badge tone={overdue ? "overdue" : row.status}>{overdue ? "Overdue" : row.status.replace("_", " ")}</Badge></td>
        <td data-label="Reminder">{row.phone && balance > 0 && row.status !== "void" ? <WhatsAppButton invoiceId={row.id} url={prepared.url} message={message}/> : <span className="muted">Not available</span>}</td>
        {showActions && <td data-label="Actions"><div className="table-actions invoice-row-actions">{row.canManageBilling && row.status !== "void" && Number(row.amount_paid) === 0 ? <ConfirmAction action={voidInvoiceAction} id={`void-invoice-${row.id}`} triggerLabel="Void" title={`Void ${row.number}?`} description="Voiding preserves the audit history but removes this invoice from active receivables." submitLabel="Void invoice" pendingLabel="Voiding…"><div className="modal-body"><input type="hidden" name="invoiceId" value={row.id}/><div className="summary-box"><span>{row.charge_type.replace("_", " ")} invoice</span><strong>{money(row.amount, row.currency)} · {row.description}</strong><small>{row.tenant_name || "Unassigned"} · {row.property_name}</small></div><div className="confirm-consequence">This is allowed only because no payment is recorded. It cannot be reversed from the interface.</div></div></ConfirmAction> : <span className="muted">No available action</span>}</div></td>}
      </tr>;
    })}</tbody></table></div></section> : <Empty icon="invoice" title={filtersActive ? "No invoices match these filters" : "No invoices yet"} text={filtersActive ? "Reset the current filters to view more receivables." : "Create an invoice to begin tracking charges, due dates, reminders, and outstanding balances."}/>} 
  </>;
}
