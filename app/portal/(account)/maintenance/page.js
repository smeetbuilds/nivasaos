import { addTenantMaintenanceCommentAction, createTenantMaintenanceAction } from "@/app/actions";
import { requireTenant } from "@/lib/tenant-auth";
import { portalMaintenanceData } from "@/lib/portal-data";
import { dateTimeLabel } from "@/lib/format";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Icon from "@/components/Icon";

export const metadata = { title: "Maintenance requests" };

export default async function PortalMaintenancePage({ searchParams }) {
  const tenant = await requireTenant();
  const data = portalMaintenanceData(tenant.tenant_id);
  const query = await searchParams;
  const open = data.tickets.filter((ticket) => ticket.status !== "resolved").length;
  return <>
    <Flash searchParams={query}/>
    <header className="portal-page-head"><div><span className="eyebrow">Maintenance support</span><h1>Report and follow issues</h1><p>Requests are tied to your active home. Property-team updates remain visible in the same timeline.</p></div>{data.leases.length > 0 && <OpenModalButton target="portal-maintenance-modal" icon="maintenance">Report an issue</OpenModalButton>}</header>

    <section className="portal-metric-grid portal-maintenance-metrics"><article><span>Open requests</span><strong>{open}</strong><small>Reported or being worked on</small></article><article><span>Resolved</span><strong>{data.tickets.filter((ticket) => ticket.status === "resolved").length}</strong><small>Kept for your records</small></article><article><span>Active homes</span><strong>{data.leases.length}</strong><small>Available for new requests</small></article></section>

    {data.tickets.length ? <div className="portal-ticket-list">{data.tickets.map((ticket) => {
      const comments = data.commentsByTicket[Number(ticket.id)] || [];
      return <article className="portal-ticket" key={ticket.id}>
        <div className="portal-ticket-head"><div><Badge tone={ticket.priority}>{ticket.priority}</Badge><span>{ticket.property_name} · {ticket.unit_name || "Property area"}</span></div><Badge tone={ticket.status}>{ticket.status.replaceAll("_", " ")}</Badge></div>
        <h2>{ticket.title}</h2><p>{ticket.description}</p>
        <div className="portal-ticket-meta"><span>Reported {dateTimeLabel(ticket.reported_at)}</span><span>{ticket.assigned_name ? `Assigned to ${ticket.assigned_name}` : "Awaiting assignment"}</span></div>
        <div className="portal-ticket-timeline"><span className="portal-timeline-label">Updates</span>{comments.length ? comments.map((comment) => <div className={`portal-comment${comment.actor_tenant_id ? " from-tenant" : " from-team"}`} key={comment.id}><span className="portal-comment-avatar">{(comment.user_name || comment.tenant_name || "U").slice(0, 1)}</span><span><strong>{comment.actor_tenant_id ? "You" : comment.user_name || "Property team"}</strong><small>{dateTimeLabel(comment.created_at)}</small><p>{comment.message}</p></span></div>) : <p className="muted">No updates yet.</p>}</div>
        {ticket.status !== "resolved" && <form action={addTenantMaintenanceCommentAction} className="portal-comment-form"><input type="hidden" name="ticketId" value={ticket.id}/><label><span>Add detail or reply</span><textarea name="message" rows="2" required placeholder="Share access timing, a photo description, or another useful detail"/></label><button className="button secondary">Send update</button></form>}
      </article>;
    })}</div> : <section className="portal-card portal-empty-state"><Icon name="maintenance" size={30}/><strong>No maintenance requests</strong><p>Report an issue from your active home and follow it through to resolution.</p>{data.leases.length > 0 && <OpenModalButton target="portal-maintenance-modal" className="button primary">Report first issue</OpenModalButton>}</section>}

    <form action={createTenantMaintenanceAction}><ModalForm id="portal-maintenance-modal" title="Report a maintenance issue" description="Choose the affected home. Property and unit details are verified from your active lease." submitLabel="Report issue" pendingLabel="Sending…"><div className="modal-body">
      <label><span>Affected home</span><select name="leaseId" required><option value="">Select home</option>{data.leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.property_name} · {lease.unit_name}</option>)}</select></label>
      <label><span>Issue title</span><input name="title" required placeholder="Water leak under kitchen sink"/></label>
      <label><span>What is happening?</span><textarea name="description" rows="5" required placeholder="Describe the issue, when it started, and whether staff can enter if you are away."/></label>
      <label><span>Priority</span><select name="priority" defaultValue="normal"><option value="low">Low · cosmetic or minor</option><option value="normal">Normal · needs attention</option><option value="high">High · affecting daily use</option><option value="urgent">Urgent · safety or active damage</option></select></label>
      <div className="policy-warning">For fire, gas, medical danger, or immediate personal safety risk, contact local emergency services first.</div>
    </div></ModalForm></form>
  </>;
}
