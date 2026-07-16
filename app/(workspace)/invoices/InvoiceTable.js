import Link from "next/link";
import { money, dateLabel, today } from "@/lib/format";
import { rentPeriodLabel } from "@/lib/rent";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import WhatsAppButton from "@/components/WhatsAppButton";
import OpenModalButton from "@/components/OpenModalButton";

export default function InvoiceTable({ workspace }) {
  const { rows, properties, propertyId, status, charge, search, template, driver, canManageBilling } = workspace;
  return <>
    <form method="get" className="filter-bar invoice-filter panel" aria-label="Filter invoices">
      <label className="filter-search"><span>Search</span><input name="search" defaultValue={search} placeholder="Invoice, source invoice, tenant, lease, or unit"/></label>
      <label><span>Property</span><select name="property" defaultValue={propertyId || ""}><option value="">All accessible properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
      <label><span>Status</span><select name="status" defaultValue={status}><option value="all">All statuses</option><option value="open">Open</option><option value="overdue">Overdue</option><option value="issued">Issued</option><option value="part_paid">Part paid</option><option value="paid">Paid</option><option value="draft">Draft</option><option value="void">Void</option></select></label>
      <label><span>Charge</span><select name="charge" defaultValue={charge}><option value="all">All charges</option><option value="rent">Rent</option><option value="late_fee">Late fee</option><option value="manual">Manual</option></select></label>
      <div className="filter-actions"><button className="button primary" type="submit">Apply filters</button>{(search || propertyId || status !== "all" || charge !== "all") && <Link className="button secondary" href="/invoices">Clear</Link>}</div>
    </form>
    {rows.length ? <div className="panel"><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Charge</th><th>Tenant</th><th>Property / unit</th><th>Due</th><th>Amount</th><th>Balance</th><th>Status</th><th>Reminder</th>{canManageBilling && <th>Actions</th>}</tr></thead><tbody>{rows.map((row) => {
      const overdue = !["paid", "void"].includes(row.status) && row.due_date < today();
      const balance = Number(row.amount) - Number(row.amount_paid);
      const message = template.replaceAll("{tenant}", row.tenant_name || "tenant").replaceAll("{invoice}", row.number).replaceAll("{balance}", money(balance, row.currency)).replaceAll("{due_date}", dateLabel(row.due_date));
      const prepared = driver.prepare({ recipient: row.phone, message });
      return <tr key={row.id} className={row.status === "void" ? "void-row" : ""}><td><strong>{row.number}</strong><small>{row.description}{row.rent_period ? ` · ${rentPeriodLabel(row.rent_period)}` : ""}</small></td><td><Badge tone={row.charge_type}>{row.charge_type.replace("_", " ")}</Badge>{row.source_invoice_number && <small>For {row.source_invoice_number}</small>}</td><td>{row.tenant_name || "Unassigned"}<small>{row.lease_reference || "No lease linked"}</small></td><td>{row.property_name}<small>{row.unit_name || "—"}</small></td><td>{dateLabel(row.due_date)}</td><td>{money(row.amount, row.currency)}<small>{money(row.amount_paid, row.currency)} paid</small></td><td><strong>{money(balance, row.currency)}</strong></td><td><Badge tone={overdue ? "overdue" : row.status}>{overdue ? "Overdue" : row.status.replace("_", " ")}</Badge></td><td>{row.phone && balance > 0 && row.status !== "void" ? <WhatsAppButton invoiceId={row.id} url={prepared.url} message={message}/> : <span className="muted">—</span>}</td>{canManageBilling && <td>{row.status !== "void" && Number(row.amount_paid) === 0 ? <OpenModalButton target={`void-invoice-${row.id}`} className="text-button danger-link">Void</OpenModalButton> : <span className="muted">—</span>}</td>}</tr>;
    })}</tbody></table></div></div> : <Empty icon="invoice" title="No invoices match" text="Clear the filters or create an invoice to begin tracking receivables."/>}
  </>;
}
