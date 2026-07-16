import Link from "next/link";
import { requireTenant } from "@/lib/tenant-auth";
import { portalLeaseData } from "@/lib/portal-data";
import { dateLabel, money } from "@/lib/format";
import Badge from "@/components/Badge";
import Icon from "@/components/Icon";

export const metadata = { title: "My home & deposit" };

function depositSign(type) {
  return ["received", "credit"].includes(type) ? 1 : -1;
}

export default async function PortalLeasePage() {
  const tenant = await requireTenant();
  const data = portalLeaseData(tenant.tenant_id);
  const active = data.leases.find((lease) => lease.status === "active");
  return <>
    <header className="portal-page-head"><div><span className="eyebrow">Occupancy record</span><h1>My home and deposit</h1><p>Lease terms and refundable deposit movements recorded by your property team.</p></div></header>

    {active ? <section className="portal-lease-hero">
      <div className="portal-lease-identity"><span className="portal-detail-icon large"><Icon name="home" size={26}/></span><div><span className="eyebrow">Active home</span><h2>{active.property_name} · {active.unit_name}</h2><p>{active.property_address}{active.city ? `, ${active.city}` : ""}{active.country ? `, ${active.country}` : ""}</p></div><Badge tone="active">Active</Badge></div>
      <div className="portal-lease-terms"><span><small>Lease reference</small><strong>{active.reference}</strong></span><span><small>Monthly rent</small><strong>{money(active.monthly_rent, active.currency)}</strong></span><span><small>Billing day</small><strong>Day {active.billing_day}</strong></span><span><small>Started</small><strong>{dateLabel(active.start_date)}</strong></span><span><small>Scheduled end</small><strong>{active.end_date ? dateLabel(active.end_date) : "Open-ended"}</strong></span><span><small>Residents</small><strong>{active.resident_names || tenant.full_name}</strong></span></div>
      {active.notes && <div className="portal-lease-note"><span>Lease note</span><p>{active.notes}</p></div>}
    </section> : <section className="portal-card portal-empty-state"><Icon name="home" size={30}/><strong>No active lease</strong><p>Your historical leases and financial records remain available below.</p></section>}

    {active && <section className="portal-deposit-summary">
      <article><span>Deposit required</span><strong>{money(active.deposit, active.currency)}</strong><small>Contractual lease amount</small></article>
      <article><span>Deposit currently held</span><strong>{money(active.deposit_held, active.currency)}</strong><small>Received and credits minus refunds and debits</small></article>
      <article><span>Difference</span><strong>{money(Number(active.deposit) - Number(active.deposit_held), active.currency)}</strong><small>{Number(active.deposit_held) >= Number(active.deposit) ? "Requirement covered" : "Remaining against lease requirement"}</small></article>
    </section>}

    <section className="portal-card">
      <div className="portal-card-head"><div><span className="eyebrow">Refundable ledger</span><h2>Deposit transactions</h2></div></div>
      {data.deposits.length ? <div className="portal-deposit-list">{data.deposits.map((item) => <Link href={`/portal/deposit-receipts/${item.id}`} key={item.id}><span className={`portal-activity-icon ${depositSign(item.transaction_type) > 0 ? "positive" : "negative"}`}><Icon name="deposit" size={18}/></span><span><strong>{item.reference}</strong><small>{item.transaction_type.replaceAll("_", " ")} · {item.property_name} · {item.unit_name} · {dateLabel(item.transacted_at)}{item.attributed_tenant_name ? ` · ${item.attributed_tenant_name}` : " · lease-level"}</small></span><strong>{depositSign(item.transaction_type) > 0 ? "+" : "−"}{money(item.amount, item.currency)}</strong><Icon name="arrow" size={16}/></Link>)}</div> : <div className="portal-empty-state compact"><strong>No deposit transactions recorded</strong><p>Ask the property team to record received deposits or refunds against the lease.</p></div>}
    </section>

    <section className="portal-card">
      <div className="portal-card-head"><div><span className="eyebrow">History</span><h2>All linked leases</h2></div></div>
      {data.leases.length ? <div className="portal-lease-history">{data.leases.map((lease) => <article key={lease.id}><span><strong>{lease.property_name} · {lease.unit_name}</strong><small>{lease.reference} · {dateLabel(lease.start_date)} to {lease.end_date ? dateLabel(lease.end_date) : "present"}</small></span><span><strong>{money(lease.monthly_rent, lease.currency)}/month</strong><small>Deposit held {money(lease.deposit_held, lease.currency)}</small></span><Badge tone={lease.status}>{lease.status}</Badge></article>)}</div> : <div className="portal-empty-state compact"><strong>No lease history</strong></div>}
    </section>
  </>;
}
