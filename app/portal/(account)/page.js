import Link from "next/link";
import { requireTenant } from "@/lib/tenant-auth";
import { portalDashboardData } from "@/lib/portal-data";
import { portalCommercialData, portalServicesData, portalSpaceData, portalVisitorsData } from "@/lib/module-data";
import { moduleById, supportsCapability } from "@/lib/modules/catalog";
import { dateLabel, money } from "@/lib/format";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Icon from "@/components/Icon";
import ModuleBadge from "@/components/ModuleBadge";

export const metadata = { title: "Tenant portal" };

function currencySummary(groups, field) {
  if (!groups.length) return money(0);
  if (groups.length === 1) return money(groups[0][field], groups[0].currency);
  return `${groups.length} currencies`;
}

export default async function TenantPortalHome({ searchParams }) {
  const tenant = await requireTenant();
  const module = moduleById(tenant.module_id);
  const data = portalDashboardData(tenant.tenant_id);
  const spaces = supportsCapability(module.id, "spaceInventory") ? portalSpaceData(tenant.tenant_id) : [];
  const services = supportsCapability(module.id, "servicePlans") ? portalServicesData(tenant.tenant_id) : [];
  const visitorData = supportsCapability(module.id, "visitorRegister") ? portalVisitorsData(tenant.tenant_id) : { visitors: [] };
  const commercial = supportsCapability(module.id, "commercialProfiles") ? portalCommercialData(tenant.tenant_id) : [];
  const query = await searchParams;
  const lease = data.activeLease;
  const activeSpace = spaces.find((space) => space.status === "active");
  const activeServices = services.filter((service) => service.status === "active");
  const visitorsInside = visitorData.visitors.filter((visitor) => visitor.status === "checked_in").length;
  const activeCommercial = commercial.find((profile) => profile.lease_status === "active");
  const nextBalance = data.nextInvoice ? Number(data.nextInvoice.amount) - Number(data.nextInvoice.amount_paid) : 0;
  const homeLabel = module.id === "commercial" ? "premises" : "home";
  return <>
    <Flash searchParams={query}/>
    {query?.welcome && <section className={`portal-welcome module-${module.id}`}><div><span className="eyebrow">{module.terminology.portal} secured</span><h1>Welcome, {tenant.full_name.split(" ")[0]}.</h1><p>Your password is active and the one-time setup link has been consumed.</p></div><Icon name={module.icon} size={34}/></section>}
    <header className="portal-page-head"><div><span className="eyebrow">{module.shortLabel} overview</span><h1>Your {homeLabel} and account</h1><p>Live {module.terminology.agreement.toLowerCase()}, billing, operations, and module-specific records linked to your profile.</p></div><div className="portal-head-actions"><ModuleBadge moduleId={module.id}/>{data.nextInvoice && <Link href="/portal/billing" className="button primary">View amount due <Icon name="arrow" size={17}/></Link>}</div></header>

    <section className="portal-metric-grid">
      <article><span>Outstanding</span><strong>{currencySummary(data.outstanding, "balance")}</strong><small>{data.outstanding.reduce((sum, row) => sum + Number(row.invoice_count || 0), 0)} open invoice(s)</small></article>
      <article><span>Deposit held</span><strong>{lease ? money(lease.deposit_held, lease.currency) : money(0)}</strong><small>{lease ? `${money(lease.deposit, lease.currency)} required` : `No active ${module.terminology.agreement.toLowerCase()}`}</small></article>
      <article><span>Payment proofs</span><strong>{data.pendingSubmissions}</strong><small>Awaiting property-team review</small></article>
      <article><span>Open maintenance</span><strong>{data.openTickets}</strong><small>Reported or in progress</small></article>
    </section>

    {(activeSpace || activeServices.length || visitorsInside || activeCommercial) && <section className="portal-module-summary-grid">
      {activeSpace && <Link href="/portal/lease"><span className="portal-service-icon"><Icon name="spaces" size={20}/></span><span><small>Allocated space</small><strong>{activeSpace.code}</strong><p>{activeSpace.unit_name} · {activeSpace.space_type}</p></span><Icon name="arrow" size={16}/></Link>}
      {activeServices.length > 0 && <Link href="/portal/services"><span className="portal-service-icon"><Icon name="services" size={20}/></span><span><small>Active services</small><strong>{activeServices.length}</strong><p>{activeServices.slice(0,2).map((service)=>service.name).join(" · ")}</p></span><Icon name="arrow" size={16}/></Link>}
      {supportsCapability(module.id,"visitorRegister") && <Link href="/portal/visitors"><span className="portal-service-icon"><Icon name="visitors" size={20}/></span><span><small>Visitors inside</small><strong>{visitorsInside}</strong><p>Pre-register and review access history</p></span><Icon name="arrow" size={16}/></Link>}
      {activeCommercial && <Link href="/portal/lease"><span className="portal-service-icon"><Icon name="commercial" size={20}/></span><span><small>Business profile</small><strong>{activeCommercial.business_name}</strong><p>{activeCommercial.escalation_date ? `Escalation ${dateLabel(activeCommercial.escalation_date)}` : "Commercial terms available"}</p></span><Icon name="arrow" size={16}/></Link>}
    </section>}

    <section className="portal-dashboard-grid">
      <article className="portal-card portal-home-card">
        <div className="portal-card-head"><div><span className="eyebrow">Current {homeLabel}</span><h2>{lease ? `${lease.property_name} · ${lease.unit_name}` : `No active ${homeLabel}`}</h2></div>{lease && <Badge tone="active">Active {module.terminology.agreement.toLowerCase()}</Badge>}</div>
        {lease ? <div className="portal-home-details"><div className="portal-address"><span className="portal-detail-icon"><Icon name={module.id === "commercial" ? "commercial" : "home"} size={20}/></span><span><strong>{lease.property_address}</strong><small>{[lease.city, lease.country].filter(Boolean).join(", ")}</small></span></div><div className="portal-detail-grid"><span><small>Monthly rent</small><strong>{money(lease.monthly_rent, lease.currency)}</strong></span><span><small>Billing day</small><strong>Day {lease.billing_day}</strong></span><span><small>Agreement began</small><strong>{dateLabel(lease.start_date)}</strong></span><span><small>{module.terminology.occupant}s</small><strong>{lease.resident_names || tenant.full_name}</strong></span></div><Link href="/portal/lease" className="text-link">View agreement, deposit, and handover <Icon name="arrow" size={15}/></Link></div> : <div className="portal-empty-state"><Icon name={module.id === "commercial" ? "commercial" : "home"} size={28}/><strong>No active {module.terminology.agreement.toLowerCase()} is linked</strong><p>Historical billing and receipts remain available.</p></div>}
      </article>

      <article className="portal-card portal-due-card">
        <div className="portal-card-head"><div><span className="eyebrow">Next action</span><h2>{data.nextInvoice ? "Payment due" : "Account up to date"}</h2></div><Icon name="receipt" size={24}/></div>
        {data.nextInvoice ? <div className="portal-next-due"><strong>{money(nextBalance, data.nextInvoice.currency)}</strong><span>{data.nextInvoice.number} · due {dateLabel(data.nextInvoice.due_date)}</span><p>{data.nextInvoice.description}</p><Link href="/portal/billing" className="button primary">View invoice and submit proof</Link></div> : <div className="portal-empty-state"><Icon name="audit" size={28}/><strong>No unpaid invoices</strong><p>Rent, services, CAM, or other charges will appear here when issued.</p></div>}
      </article>

      <article className="portal-card portal-span-2"><div className="portal-card-head"><div><span className="eyebrow">Receipts</span><h2>Recent payments</h2></div><Link href="/portal/billing" className="text-link">View all</Link></div>{data.recentPayments.length ? <div className="portal-activity-list">{data.recentPayments.map((payment) => <Link href={`/portal/receipts/${payment.id}`} key={payment.id}><span className="portal-activity-icon"><Icon name="receipt" size={18}/></span><span><strong>{payment.reference}</strong><small>{payment.invoice_number || "Unallocated payment"} · {dateLabel(payment.paid_at)}{payment.payer_name && payment.payer_name !== tenant.full_name ? ` · paid by ${payment.payer_name}` : ""}</small></span><strong>{money(payment.amount, payment.currency)}</strong></Link>)}</div> : <div className="portal-empty-state compact"><strong>No payments recorded yet</strong><p>Approved payments and downloadable receipts will appear here.</p></div>}</article>
    </section>
  </>;
}
