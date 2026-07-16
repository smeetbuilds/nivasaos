import Link from "next/link";
import { requireTenant } from "@/lib/tenant-auth";
import { portalDashboardData } from "@/lib/portal-data";
import { dateLabel, money } from "@/lib/format";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Icon from "@/components/Icon";

export const metadata = { title: "Resident portal" };

function currencySummary(groups, field) {
  if (!groups.length) return money(0);
  if (groups.length === 1) return money(groups[0][field], groups[0].currency);
  return `${groups.length} currencies`;
}

export default async function TenantPortalHome({ searchParams }) {
  const tenant = await requireTenant();
  const data = portalDashboardData(tenant.tenant_id);
  const query = await searchParams;
  const lease = data.activeLease;
  const nextBalance = data.nextInvoice ? Number(data.nextInvoice.amount) - Number(data.nextInvoice.amount_paid) : 0;
  return <>
    <Flash searchParams={query}/>
    {query?.welcome && <section className="portal-welcome"><div><span className="eyebrow">Portal secured</span><h1>Welcome home, {tenant.full_name.split(" ")[0]}.</h1><p>Your password is active and the one-time setup link has been consumed.</p></div><Icon name="audit" size={34}/></section>}
    <header className="portal-page-head"><div><span className="eyebrow">Resident overview</span><h1>Your home and account</h1><p>Live information from the property records linked to your tenant profile.</p></div>{data.nextInvoice && <Link href="/portal/billing" className="button primary">View amount due <Icon name="arrow" size={17}/></Link>}</header>

    <section className="portal-metric-grid">
      <article><span>Outstanding</span><strong>{currencySummary(data.outstanding, "balance")}</strong><small>{data.outstanding.reduce((sum, row) => sum + Number(row.invoice_count || 0), 0)} open invoice(s)</small></article>
      <article><span>Deposit held</span><strong>{lease ? money(lease.deposit_held, lease.currency) : money(0)}</strong><small>{lease ? `${money(lease.deposit, lease.currency)} required by lease` : "No active lease"}</small></article>
      <article><span>Payment proofs</span><strong>{data.pendingSubmissions}</strong><small>Awaiting property-team review</small></article>
      <article><span>Open maintenance</span><strong>{data.openTickets}</strong><small>Reported or in progress</small></article>
    </section>

    <section className="portal-dashboard-grid">
      <article className="portal-card portal-home-card">
        <div className="portal-card-head"><div><span className="eyebrow">Current home</span><h2>{lease ? `${lease.property_name} · ${lease.unit_name}` : "No active home"}</h2></div>{lease && <Badge tone="active">Active lease</Badge>}</div>
        {lease ? <div className="portal-home-details"><div className="portal-address"><span className="portal-detail-icon"><Icon name="home" size={20}/></span><span><strong>{lease.property_address}</strong><small>{[lease.city, lease.country].filter(Boolean).join(", ")}</small></span></div><div className="portal-detail-grid"><span><small>Monthly rent</small><strong>{money(lease.monthly_rent, lease.currency)}</strong></span><span><small>Billing day</small><strong>Day {lease.billing_day}</strong></span><span><small>Lease began</small><strong>{dateLabel(lease.start_date)}</strong></span><span><small>Residents</small><strong>{lease.resident_names || tenant.full_name}</strong></span></div><Link href="/portal/lease" className="text-link">View lease and deposit ledger <Icon name="arrow" size={15}/></Link></div> : <div className="portal-empty-state"><Icon name="home" size={28}/><strong>No active lease is linked</strong><p>Historical billing and receipts remain available.</p></div>}
      </article>

      <article className="portal-card portal-due-card">
        <div className="portal-card-head"><div><span className="eyebrow">Next action</span><h2>{data.nextInvoice ? "Payment due" : "Account up to date"}</h2></div><Icon name="receipt" size={24}/></div>
        {data.nextInvoice ? <div className="portal-next-due"><strong>{money(nextBalance, data.nextInvoice.currency)}</strong><span>{data.nextInvoice.number} · due {dateLabel(data.nextInvoice.due_date)}</span><p>{data.nextInvoice.description}</p><Link href="/portal/billing" className="button primary">View invoice and submit proof</Link></div> : <div className="portal-empty-state"><Icon name="audit" size={28}/><strong>No unpaid invoices</strong><p>New rent or charge invoices will appear here automatically.</p></div>}
      </article>

      <article className="portal-card portal-span-2">
        <div className="portal-card-head"><div><span className="eyebrow">Receipts</span><h2>Recent payments</h2></div><Link href="/portal/billing" className="text-link">View all</Link></div>
        {data.recentPayments.length ? <div className="portal-activity-list">{data.recentPayments.map((payment) => <Link href={`/portal/receipts/${payment.id}`} key={payment.id}><span className="portal-activity-icon"><Icon name="receipt" size={18}/></span><span><strong>{payment.reference}</strong><small>{payment.invoice_number || "Unallocated payment"} · {dateLabel(payment.paid_at)}{payment.payer_name && payment.payer_name !== tenant.full_name ? ` · paid by ${payment.payer_name}` : ""}</small></span><strong>{money(payment.amount, payment.currency)}</strong></Link>)}</div> : <div className="portal-empty-state compact"><strong>No payments recorded yet</strong><p>Approved payments and downloadable receipts will appear here.</p></div>}
      </article>
    </section>
  </>;
}
