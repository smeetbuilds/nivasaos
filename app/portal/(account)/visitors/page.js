import { redirect } from "next/navigation";
import { cancelTenantVisitorAction, preregisterTenantVisitorAction } from "@/app/actions";
import { requireTenant } from "@/lib/tenant-auth";
import { portalVisitorsData } from "@/lib/module-data";
import { moduleById, supportsCapability } from "@/lib/modules/catalog";
import { dateTimeLabel } from "@/lib/format";
import Badge from "@/components/Badge";
import ConfirmAction from "@/components/ConfirmAction";
import Flash from "@/components/Flash";
import Icon from "@/components/Icon";
import ModalForm from "@/components/ModalForm";
import OpenModalButton from "@/components/OpenModalButton";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "My visitors" };

export default async function PortalVisitorsPage({ searchParams }) {
  const tenant = await requireTenant();
  const module = moduleById(tenant.module_id);
  if (!supportsCapability(module.id, "visitorRegister")) redirect("/portal");
  const data = portalVisitorsData(tenant.tenant_id);
  const query = await searchParams;
  const expected = data.visitors.filter((visitor) => visitor.status === "expected").length;
  const inside = data.visitors.filter((visitor) => visitor.status === "checked_in").length;
  const completed = data.visitors.filter((visitor) => visitor.status === "checked_out").length;

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow={`${module.shortLabel} access`} title="My visitors" description="Pre-register expected visitors and keep the property team informed. Staff remain responsible for confirming physical check-in and check-out." actions={data.leases.length ? <OpenModalButton target="portal-visitor-create" icon="visitors">Pre-register visitor</OpenModalButton> : null}/>

    <section className="portal-metric-grid module-portal-metrics" aria-label="Resident visitor summary">
      <article className={expected ? "is-attention" : ""}><span>Expected</span><strong>{expected}</strong><small>Awaiting arrival</small></article>
      <article><span>Currently inside</span><strong>{inside}</strong><small>Staff-confirmed check-ins</small></article>
      <article><span>Completed</span><strong>{completed}</strong><small>Checked-out visits</small></article>
      <article><span>Active homes</span><strong>{data.leases.length}</strong><small>Available for pre-registration</small></article>
    </section>

    <section className="portal-card" aria-labelledby="portal-visitor-register-title">
      <div className="portal-card-head"><div><span className="eyebrow">Access history</span><h2 id="portal-visitor-register-title">Visitor registrations</h2></div><span className="portal-section-count">{data.visitors.length}</span></div>
      {data.visitors.length ? <div className="portal-visitor-list">{data.visitors.map((visitor) => {
        const titleId = `portal-visitor-${visitor.id}`;
        return <article key={visitor.id} className={visitor.status === "checked_out" || visitor.status === "cancelled" ? "is-historical" : ""} aria-labelledby={titleId}>
          <span className="portal-service-icon"><Icon name="visitors" size={20}/></span>
          <span><strong id={titleId}>{visitor.visitor_name}</strong><small>{visitor.relationship || "Visitor"} · {visitor.property_name}{visitor.unit_name ? ` · ${visitor.unit_name}` : ""}</small><p>{visitor.purpose}</p></span>
          <span><strong>{dateTimeLabel(visitor.expected_at)}</strong><small>{visitor.expected_checkout ? `Expected out ${dateTimeLabel(visitor.expected_checkout)}` : "No expected checkout"}</small>{visitor.checked_in_at && <small>Checked in {dateTimeLabel(visitor.checked_in_at)}</small>}{visitor.checked_out_at && <small>Checked out {dateTimeLabel(visitor.checked_out_at)}</small>}</span>
          <Badge tone={visitor.status === "checked_in" ? "active" : visitor.status === "checked_out" ? "paid" : visitor.status}>{visitor.status.replaceAll("_", " ")}</Badge>
          {visitor.status === "expected" && <ConfirmAction action={cancelTenantVisitorAction} id={`portal-visitor-cancel-${visitor.id}`} triggerLabel="Cancel visit" triggerClassName="text-button danger" title={`Cancel ${visitor.visitor_name}'s visit?`} description={`${visitor.property_name} · ${dateTimeLabel(visitor.expected_at)}`} submitLabel="Cancel visit" pendingLabel="Cancelling…"><div className="modal-body"><input type="hidden" name="visitorId" value={visitor.id}/><div className="confirm-consequence">The visit remains in your access history as cancelled and cannot be checked in by staff.</div></div></ConfirmAction>}
        </article>;
      })}</div> : <div className="portal-empty-state"><Icon name="visitors" size={30}/><strong>No visitor registrations</strong><p>Use pre-registration before arrival so the property team has the correct visitor details.</p></div>}
    </section>

    {data.leases.length > 0 && <form action={preregisterTenantVisitorAction}><ModalForm id="portal-visitor-create" title="Pre-register a visitor" description="This creates an expected visit only. Staff must confirm arrival and departure." submitLabel="Pre-register visitor" pendingLabel="Registering…"><div className="modal-body">
      <label><span>Home / agreement</span><select name="leaseId" required>{data.leases.map((lease) => <option value={lease.id} key={lease.id}>{lease.property_name} · {lease.unit_name} · {lease.reference}</option>)}</select></label>
      <div className="field-grid two"><label><span>Visitor name</span><input name="visitorName" required maxLength="160" autoComplete="name"/></label><label><span>Visitor phone</span><input name="visitorPhone" type="tel" inputMode="tel" autoComplete="tel" maxLength="40"/></label></div>
      <label><span>Relationship</span><input name="relationship" maxLength="100" placeholder="Parent, friend, colleague"/></label>
      <label><span>Purpose</span><input name="purpose" required maxLength="500" placeholder="Personal visit"/></label>
      <div className="field-grid two"><label><span>Expected arrival</span><input type="datetime-local" name="expectedAt" required/></label><label><span>Expected checkout</span><input type="datetime-local" name="expectedCheckout"/></label></div>
      <label><span>Notes for property staff</span><textarea name="notes" rows="3" maxLength="1200"/></label>
      <div className="policy-warning">Pre-registration is not access approval. Follow property visitor rules and contact staff for exceptions.</div>
    </div></ModalForm></form>}
  </>;
}
