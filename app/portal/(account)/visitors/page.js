import { redirect } from "next/navigation";
import { cancelTenantVisitorAction, preregisterTenantVisitorAction } from "@/app/actions";
import { requireTenant } from "@/lib/tenant-auth";
import { portalVisitorsData } from "@/lib/module-data";
import { moduleById, supportsCapability } from "@/lib/modules/catalog";
import { dateTimeLabel } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Icon from "@/components/Icon";

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
    <PageHeader eyebrow={`${module.shortLabel} access`} title="My visitors" description="Pre-register expected visitors. Property staff remain responsible for confirming physical check-in and check-out." actions={data.leases.length ? <OpenModalButton target="portal-visitor-create">Pre-register visitor</OpenModalButton> : null}/>
    <section className="portal-metric-grid module-portal-metrics"><article><span>Expected</span><strong>{expected}</strong><small>Awaiting arrival</small></article><article><span>Currently inside</span><strong>{inside}</strong><small>Staff-confirmed check-ins</small></article><article><span>Completed</span><strong>{completed}</strong><small>Checked-out visits</small></article><article><span>Active homes</span><strong>{data.leases.length}</strong><small>Available for pre-registration</small></article></section>
    <section className="portal-card"><div className="portal-card-head"><div><span className="eyebrow">Access history</span><h2>Visitor registrations</h2></div>{data.leases.length ? <OpenModalButton target="portal-visitor-create" className="button secondary">New visitor</OpenModalButton> : null}</div>{data.visitors.length ? <div className="portal-visitor-list">{data.visitors.map((visitor) => <article key={visitor.id}><span className="portal-service-icon"><Icon name="visitors" size={20}/></span><span><strong>{visitor.visitor_name}</strong><small>{visitor.relationship || "Visitor"} · {visitor.property_name}{visitor.unit_name ? ` · ${visitor.unit_name}` : ""}</small><p>{visitor.purpose}</p></span><span><strong>{dateTimeLabel(visitor.expected_at)}</strong><small>{visitor.expected_checkout ? `Expected out ${dateTimeLabel(visitor.expected_checkout)}` : "No expected checkout"}</small>{visitor.checked_in_at && <small>Checked in {dateTimeLabel(visitor.checked_in_at)}</small>}{visitor.checked_out_at && <small>Checked out {dateTimeLabel(visitor.checked_out_at)}</small>}</span><Badge tone={visitor.status === "checked_in" ? "overdue" : visitor.status === "checked_out" ? "paid" : visitor.status}>{visitor.status.replaceAll("_", " ")}</Badge>{visitor.status === "expected" && <form action={cancelTenantVisitorAction}><input type="hidden" name="visitorId" value={visitor.id}/><button className="text-button danger-text">Cancel</button></form>}</article>)}</div> : <div className="portal-empty-state"><Icon name="visitors" size={30}/><strong>No visitor registrations</strong><p>Use pre-registration before arrival so the property team has the correct visitor details.</p></div>}</section>
    {data.leases.length > 0 && <form action={preregisterTenantVisitorAction}><ModalForm id="portal-visitor-create" title="Pre-register a visitor" description="This creates an expected visit only. Staff must confirm arrival and departure." submitLabel="Pre-register visitor"><div className="modal-body"><label><span>Home / agreement</span><select name="leaseId" required>{data.leases.map((lease) => <option value={lease.id} key={lease.id}>{lease.property_name} · {lease.unit_name} · {lease.reference}</option>)}</select></label><div className="field-grid two"><label><span>Visitor name</span><input name="visitorName" required/></label><label><span>Visitor phone</span><input name="visitorPhone" inputMode="tel"/></label></div><label><span>Relationship</span><input name="relationship" placeholder="Parent, friend, colleague"/></label><label><span>Purpose</span><input name="purpose" required placeholder="Personal visit"/></label><div className="field-grid two"><label><span>Expected arrival</span><input type="datetime-local" name="expectedAt" required/></label><label><span>Expected checkout</span><input type="datetime-local" name="expectedCheckout"/></label></div><label><span>Notes for property staff</span><textarea name="notes" rows="3"/></label></div></ModalForm></form>}
  </>;
}
