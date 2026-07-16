import Link from "next/link";
import { createInvoiceAction, createRentRunAction } from "@/app/actions";
import { requireUser, propertyScopeSql } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { accessibleProperties } from "@/lib/data";
import { money, dateLabel, today } from "@/lib/format";
import { rentPeriodLabel } from "@/lib/rent";
import { extensions } from "@/lib/extensions";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import WhatsAppButton from "@/components/WhatsAppButton";
import Icon from "@/components/Icon";

export const metadata = { title: "Invoices" };

const allowedStatuses = new Set(["all", "open", "overdue", "issued", "part_paid", "paid", "draft", "void"]);

export default async function InvoicesPage({ searchParams }) {
  const user = await requireUser();
  const query = await searchParams;
  const scope = propertyScopeSql(user, "p");
  const properties = accessibleProperties(user);
  const propertyId = Number(query?.property || 0) || null;
  const status = allowedStatuses.has(String(query?.status || "all")) ? String(query?.status || "all") : "all";
  const search = String(query?.search || "").trim().slice(0, 100);
  const filters = [scope.clause];
  const params = { ...scope.params };

  if (propertyId) {
    filters.push("p.id=$filterPropertyId");
    params.filterPropertyId = propertyId;
  }
  if (status === "open") filters.push("i.status NOT IN ('paid','void')");
  else if (status === "overdue") filters.push("i.status NOT IN ('paid','void') AND i.due_date<date('now')");
  else if (status !== "all") {
    filters.push("i.status=$filterStatus");
    params.filterStatus = status;
  }
  if (search) {
    filters.push("(i.number LIKE $search OR i.description LIKE $search OR t.full_name LIKE $search OR l.reference LIKE $search OR u.name LIKE $search)");
    params.search = `%${search}%`;
  }

  const rows = all(
    `SELECT i.*,p.name property_name,p.currency,t.full_name tenant_name,t.phone,l.reference lease_reference,u.name unit_name
     FROM invoices i
     JOIN properties p ON p.id=i.property_id
     LEFT JOIN tenants t ON t.id=i.tenant_id
     LEFT JOIN leases l ON l.id=i.lease_id
     LEFT JOIN units u ON u.id=l.unit_id
     WHERE ${filters.join(" AND ")}
     ORDER BY CASE WHEN i.status NOT IN ('paid','void') AND i.due_date<date('now') THEN 0 ELSE 1 END,i.due_date DESC,i.created_at DESC`,
    params
  );
  const leases = all(`SELECT l.id,l.reference,l.property_id,p.name property_name,u.name unit_name,l.monthly_rent FROM leases l JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id WHERE ${scope.clause} AND l.status='active' ORDER BY p.name,u.name`,scope.params);
  const tenants = all(`SELECT t.id,t.full_name,t.property_id,p.name property_name FROM tenants t JOIN properties p ON p.id=t.property_id WHERE ${scope.clause} AND t.status='active' ORDER BY p.name,t.full_name`,scope.params);
  const template = get("SELECT value FROM settings WHERE key='whatsapp_template'")?.value || "Hello {tenant}, invoice {invoice} has a balance of {balance} due on {due_date}.";
  const driver = extensions.notificationDrivers.get("whatsapp_link");
  const currentPeriod = today().slice(0, 7);
  const openCount = rows.filter((row) => !["paid", "void"].includes(row.status)).length;
  const overdueCount = rows.filter((row) => !["paid", "void"].includes(row.status) && row.due_date < today()).length;
  const outstandingByCurrency = [...rows.reduce((map, row) => {
    if (["paid", "void"].includes(row.status)) return map;
    const balance = Number(row.amount) - Number(row.amount_paid);
    map.set(row.currency, (map.get(row.currency) || 0) + balance);
    return map;
  }, new Map()).entries()].map(([currency, balance]) => ({ currency, balance }));
  const outstandingLabel = outstandingByCurrency.length === 0 ? money(0) : outstandingByCurrency.length === 1 ? money(outstandingByCurrency[0].balance, outstandingByCurrency[0].currency) : `${outstandingByCurrency.length} currencies`;
  const outstandingDetail = outstandingByCurrency.length ? outstandingByCurrency.map((row) => money(row.balance, row.currency)).join(" · ") : "No open balance";
  const rentRunStatus = get(
    `SELECT COUNT(*) active,
      COALESCE(SUM(CASE WHEN EXISTS (
        SELECT 1 FROM invoices i WHERE i.lease_id=l.id AND i.rent_period=$period AND i.status!='void'
      ) THEN 1 ELSE 0 END),0) invoiced
     FROM leases l JOIN properties p ON p.id=l.property_id
     WHERE ${scope.clause} AND l.status='active' AND p.status='active'
       AND l.start_date <= date('now','start of month','+1 month','-1 day')
       AND (l.end_date IS NULL OR l.end_date >= date('now','start of month'))`,
    { ...scope.params, period: currentPeriod }
  ) || { active: 0, invoiced: 0 };
  const rentPending = Math.max(0, Number(rentRunStatus.active || 0) - Number(rentRunStatus.invoiced || 0));
  const canRunRent = user.role === "owner" || user.role === "admin";

  return <>
    <Flash searchParams={query}/>
    <PageHeader
      eyebrow="Receivables"
      title="Invoices & overdue rent"
      description="Run monthly billing, issue ad-hoc charges, monitor balances, and prepare WhatsApp reminders."
      actions={<>
        {canRunRent && <OpenModalButton target="rent-run-modal" icon="invoice" className="button secondary">Run monthly rent</OpenModalButton>}
        <OpenModalButton target="invoice-modal">Create invoice</OpenModalButton>
      </>}
    />

    <section className="metric-grid invoice-metrics">
      <article className="metric-card"><span>Invoices shown</span><strong>{rows.length}</strong><small>Current search and filters</small></article>
      <article className="metric-card"><span>Open invoices</span><strong>{openCount}</strong><small>Issued, part-paid, or draft</small></article>
      <article className="metric-card risk"><span>Overdue</span><strong>{overdueCount}</strong><small>Past due and not settled</small></article>
      <article className="metric-card"><span>Outstanding</span><strong>{outstandingLabel}</strong><small>{outstandingDetail}</small></article>
    </section>

    <section className="rent-run-strip">
      <div><span className="eyebrow">{rentPeriodLabel(currentPeriod)} rent run</span><strong>{rentPending ? `${rentPending} active lease${rentPending === 1 ? "" : "s"} still need an invoice` : "Monthly rent billing is complete"}</strong><p>{Number(rentRunStatus.invoiced || 0)} of {Number(rentRunStatus.active || 0)} active leases have a rent invoice for this period.</p></div>
      {canRunRent && <OpenModalButton target="rent-run-modal" icon="invoice" className="button light">{rentPending ? "Generate missing invoices" : "Review rent run"}</OpenModalButton>}
    </section>

    <form method="get" className="filter-bar panel" aria-label="Filter invoices">
      <label className="filter-search"><span>Search</span><input name="search" defaultValue={search} placeholder="Invoice, tenant, lease, or unit"/></label>
      <label><span>Property</span><select name="property" defaultValue={propertyId || ""}><option value="">All accessible properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
      <label><span>Status</span><select name="status" defaultValue={status}><option value="all">All statuses</option><option value="open">Open</option><option value="overdue">Overdue</option><option value="issued">Issued</option><option value="part_paid">Part paid</option><option value="paid">Paid</option><option value="draft">Draft</option><option value="void">Void</option></select></label>
      <div className="filter-actions"><button className="button primary" type="submit">Apply filters</button>{(search || propertyId || status !== "all") && <Link className="button secondary" href="/invoices">Clear</Link>}</div>
    </form>

    {rows.length ? <div className="panel"><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Tenant</th><th>Property / unit</th><th>Due</th><th>Amount</th><th>Balance</th><th>Status</th><th>Reminder</th></tr></thead><tbody>{rows.map((row) => {
      const overdue = !["paid", "void"].includes(row.status) && row.due_date < today();
      const balance = Number(row.amount) - Number(row.amount_paid);
      const message = template.replaceAll("{tenant}",row.tenant_name || "tenant").replaceAll("{invoice}",row.number).replaceAll("{balance}",money(balance,row.currency)).replaceAll("{due_date}",dateLabel(row.due_date));
      const prepared = driver.prepare({ recipient: row.phone, message });
      return <tr key={row.id}><td><strong>{row.number}</strong><small>{row.description}{row.rent_period ? ` · ${rentPeriodLabel(row.rent_period)}` : ""}</small></td><td>{row.tenant_name || "Unassigned"}<small>{row.lease_reference || "No lease linked"}</small></td><td>{row.property_name}<small>{row.unit_name || "—"}</small></td><td>{dateLabel(row.due_date)}</td><td>{money(row.amount,row.currency)}<small>{money(row.amount_paid,row.currency)} paid</small></td><td><strong>{money(balance,row.currency)}</strong></td><td><Badge tone={overdue ? "overdue" : row.status}>{overdue ? "Overdue" : row.status.replace("_"," ")}</Badge></td><td>{row.phone && balance > 0 ? <WhatsAppButton invoiceId={row.id} url={prepared.url} message={message}/> : <span className="muted">—</span>}</td></tr>;
    })}</tbody></table></div></div> : <Empty icon="invoice" title="No invoices match" text="Clear the filters or create an invoice to begin tracking receivables."/>}

    <form action={createInvoiceAction}>
      <ModalForm id="invoice-modal" title="Create an invoice" description="Linking a lease and tenant is recommended for rent collection and reminders." submitLabel="Issue invoice" pendingLabel="Issuing…">
        <div className="modal-body">
          <label><span>Property</span><select name="propertyId" required>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
          <div className="field-grid two"><label><span>Lease (optional)</span><select name="leaseId"><option value="">No lease</option>{leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.property_name} · {lease.unit_name} · {lease.reference}</option>)}</select></label><label><span>Tenant</span><select name="tenantId"><option value="">Unassigned</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.property_name} · {tenant.full_name}</option>)}</select></label></div>
          <label><span>Description</span><input name="description" required defaultValue="Monthly rent"/></label>
          <div className="field-grid three"><label><span>Issue date</span><input type="date" name="issueDate" defaultValue={today()}/></label><label><span>Due date</span><input type="date" name="dueDate" required/></label><label><span>Amount</span><input type="number" min="0.01" step="0.01" name="amount" required/></label></div>
        </div>
      </ModalForm>
    </form>

    {canRunRent && <form action={createRentRunAction}>
      <ModalForm id="rent-run-modal" title="Run monthly rent billing" description="NivasaOS creates only missing invoices. Running the same property and month again is safe." submitLabel="Generate rent invoices" pendingLabel="Generating…">
        <div className="modal-body">
          <div className="rent-run-notice"><Icon name="invoice" size={20}/><div><strong>Idempotent by lease and month</strong><span>Existing non-void rent invoices are skipped automatically. Ad-hoc invoices are not affected.</span></div></div>
          <label><span>Property scope</span><select name="propertyId"><option value="">All accessible properties</option>{properties.filter((property) => property.status === "active").map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
          <div className="field-grid two"><label><span>Rent period</span><input type="month" name="period" defaultValue={currentPeriod} required/></label><label><span>Invoice issue date</span><input type="date" name="issueDate" defaultValue={today()} required/></label></div>
          <div className="summary-box"><span>Current period readiness</span><strong>{Number(rentRunStatus.invoiced || 0)} / {Number(rentRunStatus.active || 0)} active leases invoiced</strong><small>Due dates use each lease&apos;s billing day. Rent amounts use the lease rent, not the unit&apos;s current rate.</small></div>
        </div>
      </ModalForm>
    </form>}
  </>;
}
