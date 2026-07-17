import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { dashboardData } from "@/lib/data";
import { moduleDashboardData } from "@/lib/module-data";
import { money, dateLabel, today } from "@/lib/format";
import { rentPeriodLabel } from "@/lib/rent";
import { hasPortfolioPermission } from "@/lib/permissions";
import Badge from "@/components/Badge";
import PageHeader from "@/components/PageHeader";
import Icon from "@/components/Icon";
import ModuleBadge from "@/components/ModuleBadge";
import { extensions } from "@/lib/extensions";

export const metadata = { title: "Overview" };

function moduleAction(module) {
  if (module.capabilities.includes("spaceInventory")) return ["/spaces", "Open space inventory"];
  if (module.capabilities.includes("commercialProfiles")) return ["/commercial", "Open commercial leases"];
  if (module.capabilities.includes("servicePlans")) return ["/services", "Open service operations"];
  return ["/properties", "Open properties"];
}

export default async function DashboardPage({ searchParams }) {
  const user = await requireUser();
  const data = dashboardData(user);
  const moduleRows = moduleDashboardData(user);
  const query = await searchParams;
  const canViewBilling = hasPortfolioPermission(user, "billing.manage");
  const canViewPayments = hasPortfolioPermission(user, "payments.manage");
  const canViewMaintenance = hasPortfolioPermission(user, "maintenance.manage");
  const canViewAgreements = hasPortfolioPermission(user, "agreements.manage");
  const occupancy = Number(data.units.total || 0) ? Math.round(Number(data.units.occupied || 0) / Number(data.units.total) * 100) : 0;
  const currencyMetric = (groups, field) => groups.length === 0 ? money(0) : groups.length === 1 ? money(groups[0][field], groups[0].currency) : `${groups.length} currencies`;
  const currencyDetail = (groups, field) => groups.length === 0 ? "No activity yet" : groups.map((row) => money(row[field], row.currency)).join(" · ");
  const overdueCount = data.overdueByCurrency.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const activeLeases = Number(data.rentRun.active || 0);
  const invoicedLeases = Number(data.rentRun.invoiced || 0);
  const remainingRentInvoices = Math.max(0, activeLeases - invoicedLeases);
  const rentProgress = activeLeases ? Math.round(invoicedLeases / activeLeases * 100) : 0;
  const currentPeriod = today().slice(0, 7);

  return <>
    {query?.welcome && <div className="welcome-banner modular-welcome"><div><span>Modular workspace ready</span><strong>Welcome to NivasaOS, {user.name.split(" ")[0]}.</strong><p>Create a property under its correct operating model. Module-specific inventory and workflows will appear automatically.</p></div><Link className="button light" href="/properties">Add first property <Icon name="arrow" size={17}/></Link></div>}
    <PageHeader eyebrow="Portfolio control" title="Good to see you." description="A unified view of operations and risk, limited to capabilities granted inside your property scope." actions={canViewBilling && <Link href="/invoices" className="button primary"><Icon name="plus" size={17}/>Create invoice</Link>}/>
    <section className="metric-grid">
      <article className="metric-card"><div className="metric-icon"><Icon name="property"/></div><span>Active properties</span><strong>{data.totalProperties || 0}</strong><small>Across your permitted portfolio</small></article>
      <article className="metric-card"><div className="metric-icon"><Icon name="unit"/></div><span>Unit occupancy</span><strong>{occupancy}%</strong><small>{data.units.occupied || 0} occupied · {data.units.available || 0} available</small></article>
      {canViewPayments && <article className="metric-card"><div className="metric-icon"><Icon name="payment"/></div><span>Collected this month</span><strong>{currencyMetric(data.paymentsByCurrency, "collected")}</strong><small>Recorded inside your payment scope</small></article>}
      {canViewBilling && <article className="metric-card risk"><div className="metric-icon"><Icon name="invoice"/></div><span>Overdue balance</span><strong>{currencyMetric(data.overdueByCurrency, "balance")}</strong><small>{overdueCount} overdue invoice(s) · {currencyDetail(data.overdueByCurrency, "balance")}</small></article>}
    </section>

    <section className="module-health-section"><div className="module-health-head"><div><span className="eyebrow">Operating models</span><h2>Module health</h2><p>Only records inside your property scope are included.</p></div><Link href="/modules" className="text-link">Manage architecture <Icon name="arrow" size={15}/></Link></div>{moduleRows.length ? <div className="module-health-grid">{moduleRows.map((row) => { const [href, label] = moduleAction(row.module); const spaceUtilisation = Number(row.spaces) ? Math.round(Number(row.occupied_spaces) / Number(row.spaces) * 100) : null; const risk = Number(row.visitors_inside) + Number(row.missing_commercial_profiles); return <article className={`module-health-card module-${row.module.id}`} key={row.module.id}><div className="module-health-card-head"><ModuleBadge moduleId={row.module.id}/>{risk > 0 && <Badge tone="overdue">{risk} attention</Badge>}</div><h3>{row.module.label}</h3><p>{row.module.description}</p><div className="module-health-stats"><span><small>Properties</small><strong>{row.active_properties}/{row.property_count}</strong></span>{row.module.capabilities.includes("spaceInventory") && <span><small>Space use</small><strong>{spaceUtilisation ?? 0}%</strong></span>}{row.module.capabilities.includes("servicePlans") && <span><small>Services</small><strong>{row.active_services}</strong></span>}{row.module.capabilities.includes("visitorRegister") && <span><small>Visitors inside</small><strong>{row.visitors_inside}</strong></span>}{row.module.capabilities.includes("commercialProfiles") && <span><small>Profiles missing</small><strong>{row.missing_commercial_profiles}</strong></span>}</div><Link href={href} className="button secondary module-health-action">{label} <Icon name="arrow" size={15}/></Link></article>; })}</div> : <div className="panel quiet-state">Create the first property to activate module health.</div>}</section>

    <section className="dashboard-grid">
      {canViewBilling && <article className="panel span-2"><div className="panel-head"><div><span className="eyebrow">Receivables</span><h2>Recent invoices</h2></div><Link href="/invoices" className="text-link">View all</Link></div><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Tenant</th><th>Property</th><th>Due</th><th>Balance</th><th>Status</th></tr></thead><tbody>{data.recentInvoices.map((row) => { const overdue = row.status !== "paid" && row.status !== "void" && row.due_date < today(); return <tr key={row.id}><td><strong>{row.number}</strong><small>{row.description}</small></td><td>{row.tenant_name || "Unassigned"}</td><td>{row.property_name}</td><td>{dateLabel(row.due_date)}</td><td>{money(Number(row.amount) - Number(row.amount_paid), row.currency)}</td><td><Badge tone={overdue ? "overdue" : row.status}>{overdue ? "Overdue" : row.status}</Badge></td></tr>; })}</tbody></table></div></article>}
      {canViewMaintenance && <article className="panel"><div className="panel-head"><div><span className="eyebrow">Operations</span><h2>Maintenance queue</h2></div><Link href="/maintenance" className="text-link">Open board</Link></div><div className="ticket-list">{data.recentTickets.length ? data.recentTickets.map((ticket) => <div className="ticket-mini" key={ticket.id}><div><Badge tone={ticket.priority}>{ticket.priority}</Badge><strong>{ticket.title}</strong><span>{ticket.property_name}{ticket.unit_name ? ` · ${ticket.unit_name}` : ""}</span></div><Badge tone={ticket.status}>{ticket.status.replace("_", " ")}</Badge></div>) : <div className="quiet-state">No open maintenance tickets.</div>}</div><div className="maintenance-total"><span>Open work orders</span><strong>{data.maintenance || 0}</strong></div></article>}
    </section>

    <section className="dashboard-grid dashboard-followups">
      {canViewBilling && <article className="panel action-panel"><div className="panel-head"><div><span className="eyebrow">Monthly billing</span><h2>{rentPeriodLabel(currentPeriod)} rent run</h2></div><Badge tone={remainingRentInvoices ? "draft" : "paid"}>{remainingRentInvoices ? `${remainingRentInvoices} pending` : "Complete"}</Badge></div><div className="action-panel-body"><div className="action-stat"><strong>{invoicedLeases}</strong><span>of {activeLeases} active agreements invoiced</span></div><div className="progress full"><i style={{ width: `${rentProgress}%` }}/></div><p>{activeLeases ? (remainingRentInvoices ? "Generate missing recurring rent invoices in one safe, repeatable run." : "Every active agreement has a rent invoice for this month.") : "Create an active agreement to begin monthly billing."}</p><Link href="/invoices" className="button secondary">Open rent run <Icon name="arrow" size={16}/></Link></div></article>}
      {canViewAgreements && <article className="panel action-panel"><div className="panel-head"><div><span className="eyebrow">Agreement follow-up</span><h2>Expiring within 45 days</h2></div><Link href="/leases" className="text-link">View agreements</Link></div>{data.leaseExpiries.length ? <div className="expiry-list">{data.leaseExpiries.map((lease) => <div key={lease.id}><span className="expiry-date">{dateLabel(lease.end_date)}</span><span><strong>{lease.unit_name} · {lease.property_name}</strong><small>{lease.tenant_names || lease.reference}</small></span></div>)}</div> : <div className="quiet-state">No active agreements expire in the next 45 days.</div>}</article>}
      {canViewBilling && <article className="panel action-panel"><div className="panel-head"><div><span className="eyebrow">Collection policy</span><h2>Late-fee readiness</h2></div><Badge tone={data.lateFees.count ? "overdue" : "paid"}>{data.lateFees.count ? `${data.lateFees.count} eligible` : "Clear"}</Badge></div><div className="action-panel-body"><div className="action-stat"><strong>{data.lateFees.count}</strong><span>rent invoice{data.lateFees.count === 1 ? "" : "s"} beyond grace</span></div><p>{data.lateFees.count ? "Review property rules and preview separate fee invoices before applying them." : "No unpaid rent invoice has passed its configured grace period."}</p><Link href="/billing" className="button secondary">Review billing rules <Icon name="arrow" size={16}/></Link></div></article>}
    </section>
    {extensions.dashboardSections.map((section) => { const Section = section.render; return Section ? <Section key={section.id} user={user} data={data}/> : null; })}
  </>;
}
