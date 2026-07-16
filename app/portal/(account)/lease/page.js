import Link from "next/link";
import { acknowledgeInspectionAction } from "@/app/actions";
import { requireTenant } from "@/lib/tenant-auth";
import { portalLeaseData } from "@/lib/portal-data";
import { portalHandoverData } from "@/lib/handover-data";
import { dateLabel, dateTimeLabel, money } from "@/lib/format";
import Badge from "@/components/Badge";
import Icon from "@/components/Icon";
import Flash from "@/components/Flash";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";

export const metadata = { title: "My home & handover" };

function depositSign(type) {
  return ["received", "credit"].includes(type) ? 1 : -1;
}

function conditionTone(condition) {
  if (["excellent", "good"].includes(condition)) return "paid";
  if (["damaged", "missing"].includes(condition)) return "overdue";
  return "inactive";
}

export default async function PortalLeasePage({ searchParams }) {
  const tenant = await requireTenant();
  const data = portalLeaseData(tenant.tenant_id);
  const handover = portalHandoverData(tenant.tenant_id);
  const query = await searchParams;
  const active = data.leases.find((lease) => lease.status === "active");
  return <>
    <Flash searchParams={query}/>
    <header className="portal-page-head"><div><span className="eyebrow">Occupancy record</span><h1>My home, documents, and handover</h1><p>Lease terms, deposit movements, condition reports, files, and keys linked to your tenancy.</p></div></header>

    {active ? <section className="portal-lease-hero">
      <div className="portal-lease-identity"><span className="portal-detail-icon large"><Icon name="home" size={26}/></span><div><span className="eyebrow">Active home</span><h2>{active.property_name} · {active.unit_name}</h2><p>{active.property_address}{active.city ? `, ${active.city}` : ""}{active.country ? `, ${active.country}` : ""}</p></div><Badge tone="active">Active</Badge></div>
      <div className="portal-lease-terms"><span><small>Lease reference</small><strong>{active.reference}</strong></span><span><small>Monthly rent</small><strong>{money(active.monthly_rent, active.currency)}</strong></span><span><small>Billing day</small><strong>Day {active.billing_day}</strong></span><span><small>Started</small><strong>{dateLabel(active.start_date)}</strong></span><span><small>Scheduled end</small><strong>{active.end_date ? dateLabel(active.end_date) : "Open-ended"}</strong></span><span><small>Residents</small><strong>{active.resident_names || tenant.full_name}</strong></span></div>
      {active.notes && <div className="portal-lease-note"><span>Lease note</span><p>{active.notes}</p></div>}
    </section> : <section className="portal-card portal-empty-state"><Icon name="home" size={30}/><strong>No active lease</strong><p>Your historical leases, documents, and financial records remain available.</p></section>}

    {active && <section className="portal-deposit-summary">
      <article><span>Deposit required</span><strong>{money(active.deposit, active.currency)}</strong><small>Contractual lease amount</small></article>
      <article><span>Deposit currently held</span><strong>{money(active.deposit_held, active.currency)}</strong><small>Received and credits minus refunds and debits</small></article>
      <article><span>Difference</span><strong>{money(Number(active.deposit) - Number(active.deposit_held), active.currency)}</strong><small>{Number(active.deposit_held) >= Number(active.deposit) ? "Requirement covered" : "Remaining against lease requirement"}</small></article>
    </section>}

    <section className="portal-card">
      <div className="portal-card-head"><div><span className="eyebrow">Shared records</span><h2>Documents</h2></div><Badge tone={handover.documents.length ? "active" : "inactive"}>{handover.documents.length}</Badge></div>
      {handover.documents.length ? <div className="portal-document-grid">{handover.documents.map((item) => <a href={`/portal/lease-documents/${item.id}`} target="_blank" rel="noreferrer" key={item.id}><span className="portal-activity-icon"><Icon name="document" size={18}/></span><span><strong>{item.title}</strong><small>{item.document_type.replaceAll("_", " ")} · {item.property_name} · {dateLabel(item.created_at.slice(0, 10))}</small></span><Icon name="arrow" size={16}/></a>)}</div> : <div className="portal-empty-state compact"><Icon name="document" size={26}/><strong>No tenant-visible documents</strong><p>Agreements, notices, inventories, and handover files shared by the property team will appear here.</p></div>}
    </section>

    <section className="portal-card">
      <div className="portal-card-head"><div><span className="eyebrow">Condition evidence</span><h2>Inspections</h2></div></div>
      {handover.inspections.length ? <div className="portal-inspection-list">{handover.inspections.map((inspection) => {
        const items = handover.itemsByInspection[Number(inspection.id)] || [];
        return <article className="portal-inspection-card" key={inspection.id}>
          <div className="portal-inspection-head"><span><strong>{inspection.reference}</strong><small>{inspection.inspection_type.replaceAll("_", " ")} · {inspection.property_name} · {inspection.unit_name} · {dateLabel(inspection.scheduled_for)}</small></span><Badge tone={inspection.status}>{inspection.status}</Badge></div>
          {inspection.summary && <p>{inspection.summary}</p>}
          {(inspection.electricity_meter || inspection.water_meter || inspection.gas_meter) && <div className="portal-meter-grid"><span><small>Electricity</small><strong>{inspection.electricity_meter || "—"}</strong></span><span><small>Water</small><strong>{inspection.water_meter || "—"}</strong></span><span><small>Gas</small><strong>{inspection.gas_meter || "—"}</strong></span></div>}
          <div className="portal-condition-list">{items.map((item) => <div key={item.id}><span><strong>{item.area} · {item.item_name}</strong><small>{item.notes || "No condition note"}</small></span><span><Badge tone={conditionTone(item.condition)}>{item.condition.replaceAll("_", " ")}</Badge>{Number(item.charge_amount) > 0 && <small>{money(item.charge_amount, inspection.currency)} assessed</small>}</span></div>)}</div>
          <div className="portal-inspection-foot"><span>{inspection.acknowledged_at ? `Acknowledged ${dateTimeLabel(inspection.acknowledged_at)}` : "Awaiting your acknowledgement"}</span>{!inspection.acknowledged_at && ["shared", "acknowledged", "completed"].includes(inspection.status) && <OpenModalButton target={`ack-inspection-${inspection.id}`} className="button secondary">Review and acknowledge</OpenModalButton>}</div>
        </article>;
      })}</div> : <div className="portal-empty-state compact"><Icon name="inspection" size={26}/><strong>No shared condition reports</strong><p>Move-in, periodic, or move-out reports become visible after the property team shares them.</p></div>}
    </section>

    <section className="portal-card">
      <div className="portal-card-head"><div><span className="eyebrow">Physical access</span><h2>Keys and access items</h2></div></div>
      {handover.keys.length ? <div className="portal-key-list">{handover.keys.map((item) => <article key={item.id}><span className="portal-activity-icon"><Icon name="key" size={18}/></span><span><strong>{item.key_type} · {item.quantity}</strong><small>{item.action} · {item.property_name} · {item.unit_name} · {dateLabel(item.transacted_at)}{item.attributed_tenant ? ` · ${item.attributed_tenant}` : ""}</small></span><Badge tone={["issued", "replaced"].includes(item.action) ? "active" : "inactive"}>{item.action}</Badge></article>)}</div> : <div className="portal-empty-state compact"><strong>No key transactions recorded</strong></div>}
    </section>

    <section className="portal-card">
      <div className="portal-card-head"><div><span className="eyebrow">Refundable ledger</span><h2>Deposit transactions</h2></div></div>
      {data.deposits.length ? <div className="portal-deposit-list">{data.deposits.map((item) => <Link href={`/portal/deposit-receipts/${item.id}`} key={item.id}><span className={`portal-activity-icon ${depositSign(item.transaction_type) > 0 ? "positive" : "negative"}`}><Icon name="deposit" size={18}/></span><span><strong>{item.reference}</strong><small>{item.transaction_type.replaceAll("_", " ")} · {item.property_name} · {item.unit_name} · {dateLabel(item.transacted_at)}{item.attributed_tenant_name ? ` · ${item.attributed_tenant_name}` : " · lease-level"}</small></span><strong>{depositSign(item.transaction_type) > 0 ? "+" : "−"}{money(item.amount, item.currency)}</strong><Icon name="arrow" size={16}/></Link>)}</div> : <div className="portal-empty-state compact"><strong>No deposit transactions recorded</strong><p>Ask the property team to record received deposits or refunds against the lease.</p></div>}
    </section>

    <section className="portal-card">
      <div className="portal-card-head"><div><span className="eyebrow">History</span><h2>All linked leases</h2></div></div>
      {data.leases.length ? <div className="portal-lease-history">{data.leases.map((lease) => <article key={lease.id}><span><strong>{lease.property_name} · {lease.unit_name}</strong><small>{lease.reference} · {dateLabel(lease.start_date)} to {lease.end_date ? dateLabel(lease.end_date) : "present"}</small></span><span><strong>{money(lease.monthly_rent, lease.currency)}/month</strong><small>Deposit held {money(lease.deposit_held, lease.currency)}</small></span><Badge tone={lease.status}>{lease.status}</Badge></article>)}</div> : <div className="portal-empty-state compact"><strong>No lease history</strong></div>}
    </section>

    {handover.inspections.filter((item) => !item.acknowledged_at && ["shared", "acknowledged", "completed"].includes(item.status)).map((inspection) => <form action={acknowledgeInspectionAction} key={`ack-${inspection.id}`}><ModalForm id={`ack-inspection-${inspection.id}`} title={`Acknowledge ${inspection.reference}`} description="This records that you received and reviewed the condition report. It is not a waiver, admission, or legal signature." submitLabel="Acknowledge receipt"><div className="modal-body"><input type="hidden" name="inspectionId" value={inspection.id}/><div className="summary-box"><span>Condition report</span><strong>{inspection.inspection_type.replaceAll("_", " ")} · {dateLabel(inspection.scheduled_for)}</strong><small>{inspection.item_count} item(s) · {money(inspection.assessed_charge, inspection.currency)} assessed</small></div><label><span>Your note (optional)</span><textarea name="tenantNote" rows="4" placeholder="Record any disagreement, clarification, existing damage, or follow-up requested"/></label><div className="policy-warning">Acknowledgement confirms receipt and review only. Your note is preserved with the report.</div></div></ModalForm></form>)}
  </>;
}
