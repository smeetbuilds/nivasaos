import Link from "next/link";
import { dashboardData } from "@/lib/data";
import { moduleDashboardData } from "@/lib/module-data";
import { money, dateLabel, today } from "@/lib/format";
import { rentPeriodLabel } from "@/lib/rent";
import { hasPortfolioPermission, hasPortfolioRequirements, requirePortfolioPermission } from "@/lib/permissions";
import { runWithPermissionScope } from "@/lib/permission-context";
import Badge from "@/components/Badge";
import FirstRunOnboarding from "@/components/FirstRunOnboarding";
import PageHeader from "@/components/PageHeader";
import Icon from "@/components/Icon";
import ModuleBadge from "@/components/ModuleBadge";
import { extensions } from "@/lib/extensions";

export const metadata = { title: "Overview" };

function moduleAction(module, user) {
  if (module.capabilities.includes("spaceInventory") && hasPortfolioRequirements(user, { allOf: ["inventory.manage", "agreements.manage"] })) return ["/spaces", "Open space inventory"];
  if (module.capabilities.includes("commercialProfiles") && hasPortfolioPermission(user, "verticals.manage")) return ["/commercial", "Open commercial leases"];
  if (module.capabilities.includes("servicePlans") && hasPortfolioPermission(user, "services.manage")) return ["/services", "Open service operations"];
  return ["/properties", "Open properties"];
}

export default async function DashboardPage({ searchParams }) {
  const user = await requirePortfolioPermission("portfolio.view");
  const { data, moduleRows } = runWithPermissionScope("portfolio.view", () => ({
    data: dashboardData(user),
    moduleRows: moduleDashboardData(user)
  }));
  const query = await searchParams;
  const canViewBilling = hasPortfolioPermission(user, "billing.manage");
  const canViewPayments = hasPortfolioPermission(user, "payments.manage");
  const canViewMaintenance = hasPortfolioPermission(user, "maintenance.manage");
  const canViewAgreements = hasPortfolioPermission(user, "agreements.manage");
  const canManageInventory = hasPortfolioPermission(user, "inventory.manage");
  const canManageSettings = hasPortfolioPermission(user, "settings.manage");
  const canCreateProperties = hasPortfolioPermission(user, "properties.manage");
  const occupancy = Number(data.units.total || 0) ? Math.round(Number(data.units.occupied || 0) / Number(data.units.total) * 100) : 0;
  const currencyMetric = (groups, field) => groups.length === 0 ? money(0) : groups.length === 1 ? money(groups[0][field], groups[0].currency) : `${groups.length} currencies`;
  const currencyDetail = (groups, field) => groups.length === 0 ? "No activity yet" : groups.map((row) => money(row[field], row.currency)).join(" · ");
  const overdueCount = data.overdueByCurrency.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const activeLeases = Number(data.rentRun.active || 0);
  const invoicedLeases = Number(data.rentRun.invoiced || 0);
  const remainingRentInvoices = Math.max(0, activeLeases - invoicedLeases);
  const rentProgress = activeLeases ? Math.round(invoicedLeases / activeLeases * 100) : 0;
  const currentPeriod = today().slice(0, 7);
  const primaryPanelCount = Number(canViewBilling) + Number(canViewMaintenance);
  const followupPanelCount = Number(canViewBilling) * 2 + Number(canViewAgreements);

  return <>
    {query?.welcome && <FirstRunOnboarding
      firstName={user.name.split(" ")[0]}
      totalProperties={data.totalProperties || 0}
      totalUnits={data.units.total || 0}
      activeAgreements={activeLeases}
      permissions={{ properties: canCreateProperties, inventory: canManageInventory, agreements: canViewAgreements, settings: canManageSettings }}
    />}
    <PageHeader className="dashboard-page-header" eyebrow="Workspace command centre" title="Portfolio overview" description="Monitor occupancy, collections, operational risk, and upcoming work across the properties you are authorised to manage." actions={canViewBilling && <Link href="/invoices" className="button primary"><Icon name="plus" size={17}/>Create invoice</Link>}/>

    <section className="metric-grid executive-metrics" aria-label="Portfolio summary">
      <article className="metric-card"><div className="metric-icon"><Icon name="property"/></div><span>Active properties</span><strong>{data.totalProperties || 0}</strong><small>Across your permitted portfolio</small></article>
      <article className="metric-card"><div className="metric-icon"><Icon name="unit"/></div><span>Unit occupancy</span><strong>{occupancy}%</strong><small>{data.units.occupied || 0} occupied · {data.units.available || 0} available</small></article>
      {canViewPayments && <article className="metric-card"><div className="metric-icon"><Icon name="payment"/></div><span>Collected this month</span><strong>{currencyMetric(data.paymentsByCurrency, "collected")}</strong><small>Recorded inside your payment scope</small></article>}
      {canViewBilling && <article className={`metric-card${overdueCount ? " risk" : ""}`}><div className="metric-icon"><Icon name="invoice"/></div><span>Overdue balance</span><strong>{currencyMetric(data.overdueByCurrency, "balance")}</strong><small>{overdueCount} overdue invoice(s) · {currencyDetail(data.overdueByCurrency, "balance")}</small></article>}
    </section>

    <section className="module-health-section" aria-labelledby="operating-model-health-title">
      <div className="module-health-head"><div><span className="eyebrow">Operating models</span><h2 id="operating-model-health-title">Operating model health</h2><p>Operational metrics are limited to properties inside your permission scope.</p></div>{canManageSettings && <Link href="/modules" className="text-link">Configure modules <Icon name="arrow" size={15}/></Link>}</div>
      {moduleRows.length ? <div className="module-health-grid">{moduleRows.map((row) => {
        const [href, label] = moduleAction(row.module, user);
        const spaceUtilisation = Number(row.spaces) ? Math.round(Number(row.occupied_spaces) / Number(row.spaces) * 100) : null;
        const risk = Number(row.visitors_inside) + Number(row.missing_commercial_profiles);
        return <article className={`module-health-card module-${row.module.id}`} aria-label={`${row.module.label} operating model`} key={row.module.id}>
          <div className="module-health-card-head"><ModuleBadge moduleId={row.module.id}/>{risk > 0 && <Badge tone="overdue">{risk} attention</Badge>}</div>
          <h3>{row.module.label}</h3><p>{row.module.description}</p>
          <div className="module-health-stats"><span><small>Properties</small><strong>{row.active_properties}/{row.property_count}</strong></span>{row.module.capabilities.includes("spaceInventory") && <span><small>Space use</small><strong>{spaceUtilisation ?? 0}%</strong></span>}{row.module.capabilities.includes("servicePlans") && <span><small>Services</small><strong>{row.active_services}</strong></span>}{row.module.capabilities.includes("visitorRegister") && <span><small>Visitors inside</small><strong>{row.visitors_inside}</strong></span>}{row.module.capabilities.includes("commercialProfiles") && <span><small>Profiles missing</small><strong>{row.missing_commercial_profiles}</strong></span>}</div>
          <Link href={href} className="button secondary module-health-action">{label} <Icon name="arrow" size={15}/></Link>
        </article>;
      })}</div> : <div className="panel quiet-state">Create the first property to activate operating model health.</div>}
    </section>

    {primaryPanelCount > 0 && <section className={`dashboard-grid dashboard-primary-grid${primaryPanelCount === 1 ? " is-single" : ""}`} aria-label="Operational overview">
      {canViewBilling && <article className="panel dashboard-invoices-panel"><div className="panel-head"><div><span className="eyebrow">Receivables</span><h2>Recent invoices</h2></div><Link href="/invoices" className="text-link">View all</Link></div>{data.recentInvoices.length ? <div className="table-wrap"><table className="dashboard-invoice-table" data-mobile-cards aria-label="Recent invoices"><thead><tr><th>Invoice</th><th>Tenant</th><th>Property</th><th>Due</th><th>Balance</th><th>Status</th></tr></thead><tbody>{data.recentInvoices.map((row) => { const overdue = row.status !== "paid" && row.status !== "void" && row.due_date < today(); return <tr key={row.id}><td data-label="Invoice"><strong>{row.number}</strong><small>{row.description}</small></td><td data-label="Tenant">{row.tenant_name || "Unassigned"}</td><td data-label="Property">{row.property_name}</td><td data-label="Due">{dateLabel(row.due_date)}</td><td data-label="Balance">{money(Number(row.amount) - Number(row.amount_paid), row.currency)}</td><td data-label="Status"><Badge tone={overdue ? "overdue" : row.status}>{overdue ? "Overdue" : row.status}</Badge></td></tr>; })}</tbody></table></div> : <div className="dashboard-empty-state"><span className="dashboard-empty-icon"><Icon name="invoice" size={21}/></span><strong>No invoices yet</strong><small>Issued invoices will appear here with their due date, balance, and collection status.</small></div>}</article>}
      {canViewMaintenance && <article className="panel dashboard-maintenance-panel"><div className="panel-head"><div><span className="eyebrow">Operations</span><h2>Maintenance queue</h2></div><Link href="/maintenance" className="text-link">Open board</Link></div>{data.recentTickets.length ? <div className="ticket-list">{data.recentTickets.map((ticket) => <div className="ticket-mini" key={ticket.id}><div><Badge tone={ticket.priority}>{ticket.priority}</Badge><strong>{ticket.title}</strong><span>{ticket.property_name}{ticket.unit_name ? ` · ${ticket.unit_name}` : ""}</span></div><Badge tone={ticket.status}>{ticket.status.replace("_", " ")}</Badge></div>)}</div> : <div className="dashboard-empty-state compact"><span className="dashboard-empty-icon"><Icon name="maintenance" size={21}/></span><strong>Maintenance queue is clear</strong><small>New work orders will appear here for immediate triage.</small></div>}<div className="maintenance-total"><span>Open work orders</span><strong>{data.maintenance || 0}</strong></div></article>}
    </section>}

    {followupPanelCount > 0 && <section className="dashboard-grid dashboard-followups" aria-label="Upcoming actions">
      {canViewBilling && <article className="panel action-panel"><div className="panel-head"><div><span className="eyebrow">Monthly billing</span><h2>{rentPeriodLabel(currentPeriod)} rent run</h2></div><Badge tone={remainingRentInvoices ? "draft" : "paid"}>{remainingRentInvoices ? `${remainingRentInvoices} pending` : "Complete"}</Badge></div><div className="action-panel-body"><div className="action-stat"><strong>{invoicedLeases}</strong><span>of {activeLeases} active agreements invoiced</span></div><progress className="progress native-progress full" max="100" value={rentProgress} aria-label={`${rentProgress}% of active agreements invoiced`}>{rentProgress}%</progress><p>{activeLeases ? (remainingRentInvoices ? "Generate missing recurring rent invoices in one safe, repeatable run." : "Every active agreement has a rent invoice for this month.") : "Create an active agreement to begin monthly billing."}</p><Link href="/invoices" className="button secondary">Open rent run <Icon name="arrow" size={16}/></Link></div></article>}
      {canViewAgreements && <article className="panel action-panel"><div className="panel-head"><div><span className="eyebrow">Agreement follow-up</span><h2>Expiring within 45 days</h2></div><Link href="/leases" className="text-link">View agreements</Link></div>{data.leaseExpiries.length ? <div className="expiry-list">{data.leaseExpiries.map((lease) => <div key={lease.id}><span className="expiry-date">{dateLabel(lease.end_date)}</span><span><strong>{lease.unit_name} · {lease.property_name}</strong><small>{lease.tenant_names || lease.reference}</small></span></div>)}</div> : <div className="dashboard-empty-state compact"><span className="dashboard-empty-icon"><Icon name="lease" size={21}/></span><strong>No upcoming expiries</strong><small>No active agreement expires during the next 45 days.</small></div>}</article>}
      {canViewBilling && <article className="panel action-panel"><div className="panel-head"><div><span className="eyebrow">Collection policy</span><h2>Late-fee readiness</h2></div><Badge tone={data.lateFees.count ? "overdue" : "paid"}>{data.lateFees.count ? `${data.lateFees.count} eligible` : "Clear"}</Badge></div><div className="action-panel-body"><div className="action-stat"><strong>{data.lateFees.count}</strong><span>rent invoice{data.lateFees.count === 1 ? "" : "s"} beyond grace</span></div><p>{data.lateFees.count ? "Review property rules and preview separate fee invoices before applying them." : "No unpaid rent invoice has passed its configured grace period."}</p><Link href="/billing" className="button secondary">Review billing rules <Icon name="arrow" size={16}/></Link></div></article>}
    </section>}
    {extensions.dashboardSections.map((section) => { const Section = section.render; return Section ? <Section key={section.id} user={user} data={data}/> : null; })}
  </>;
}
