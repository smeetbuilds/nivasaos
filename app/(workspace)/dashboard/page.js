import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { dashboardData } from "@/lib/data";
import { money, dateLabel } from "@/lib/format";
import Badge from "@/components/Badge";
import PageHeader from "@/components/PageHeader";
import Icon from "@/components/Icon";
import { extensions } from "@/lib/extensions";

export const metadata = { title: "Overview" };

export default async function DashboardPage({ searchParams }) {
  const user = await requireUser();
  const data = dashboardData(user);
  const query = await searchParams;
  const occupancy = Number(data.units.total || 0) ? Math.round(Number(data.units.occupied || 0) / Number(data.units.total) * 100) : 0;
  const currencyMetric = (groups, field) => groups.length === 0 ? money(0) : groups.length === 1 ? money(groups[0][field], groups[0].currency) : `${groups.length} currencies`;
  const currencyDetail = (groups, field) => groups.length === 0 ? "No activity yet" : groups.map(row => money(row[field], row.currency)).join(" · ");
  const overdueCount = data.overdueByCurrency.reduce((sum, row) => sum + Number(row.count || 0), 0);
  return <>
    {query?.welcome && <div className="welcome-banner"><div><span>Workspace ready</span><strong>Welcome to NivasaOS, {user.name.split(" ")[0]}.</strong><p>Add a property and its units, then create tenants and leases to begin.</p></div><Link className="button light" href="/properties">Add first property <Icon name="arrow" size={17}/></Link></div>}
    <PageHeader eyebrow="Portfolio control" title="Good to see you." description="A live view of occupancy, collections, arrears, and work that needs attention." actions={<Link href="/invoices" className="button primary"><Icon name="plus" size={17}/>Create invoice</Link>}/>
    <section className="metric-grid">
      <article className="metric-card"><div className="metric-icon"><Icon name="property"/></div><span>Active properties</span><strong>{data.totalProperties || 0}</strong><small>Across your permitted portfolio</small></article>
      <article className="metric-card"><div className="metric-icon"><Icon name="unit"/></div><span>Occupancy</span><strong>{occupancy}%</strong><small>{data.units.occupied || 0} occupied · {data.units.available || 0} available</small></article>
      <article className="metric-card"><div className="metric-icon"><Icon name="payment"/></div><span>Collected this month</span><strong>{currencyMetric(data.moneyByCurrency, "collected")}</strong><small>{currencyDetail(data.moneyByCurrency, "billed")} billed</small></article>
      <article className="metric-card risk"><div className="metric-icon"><Icon name="invoice"/></div><span>Overdue balance</span><strong>{currencyMetric(data.overdueByCurrency, "balance")}</strong><small>{overdueCount} overdue invoice(s) · {currencyDetail(data.overdueByCurrency, "balance")}</small></article>
    </section>
    <section className="dashboard-grid">
      <article className="panel span-2"><div className="panel-head"><div><span className="eyebrow">Receivables</span><h2>Recent invoices</h2></div><Link href="/invoices" className="text-link">View all</Link></div>
        <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Tenant</th><th>Property</th><th>Due</th><th>Balance</th><th>Status</th></tr></thead><tbody>{data.recentInvoices.map(row => { const overdue = row.status !== "paid" && row.status !== "void" && row.due_date < new Date().toISOString().slice(0,10); return <tr key={row.id}><td><strong>{row.number}</strong><small>{row.description}</small></td><td>{row.tenant_name || "Unassigned"}</td><td>{row.property_name}</td><td>{dateLabel(row.due_date)}</td><td>{money(Number(row.amount)-Number(row.amount_paid), row.currency)}</td><td><Badge tone={overdue ? "overdue" : row.status}>{overdue ? "Overdue" : row.status}</Badge></td></tr>})}</tbody></table></div>
      </article>
      <article className="panel"><div className="panel-head"><div><span className="eyebrow">Operations</span><h2>Maintenance queue</h2></div><Link href="/maintenance" className="text-link">Open board</Link></div>
        <div className="ticket-list">{data.recentTickets.length ? data.recentTickets.map(ticket => <div className="ticket-mini" key={ticket.id}><div><Badge tone={ticket.priority}>{ticket.priority}</Badge><strong>{ticket.title}</strong><span>{ticket.property_name}{ticket.unit_name ? ` · ${ticket.unit_name}` : ""}</span></div><Badge tone={ticket.status}>{ticket.status.replace("_"," ")}</Badge></div>) : <div className="quiet-state">No open maintenance tickets.</div>}</div>
        <div className="maintenance-total"><span>Open work orders</span><strong>{data.maintenance || 0}</strong></div>
      </article>
    </section>
    {extensions.dashboardSections.map(section => {
      const Section = section.render;
      return Section ? <Section key={section.id} user={user} data={data}/> : null;
    })}
  </>;
}
