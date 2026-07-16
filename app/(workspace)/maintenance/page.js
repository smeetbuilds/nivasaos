import { addStaffMaintenanceCommentAction, createMaintenanceAction, updateMaintenanceAction } from "@/app/actions";
import { requireUser, propertyScopeSql } from "@/lib/auth";
import { all } from "@/lib/db";
import { accessibleProperties } from "@/lib/data";
import { dateTimeLabel } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import Icon from "@/components/Icon";

export const metadata = { title: "Maintenance" };

export default async function MaintenancePage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const properties = accessibleProperties(user);
  const tickets = all(
    `SELECT mt.*,p.name property_name,u.name unit_name,t.full_name tenant_name,assignee.name assigned_name,
      (SELECT COUNT(*) FROM maintenance_comments mc WHERE mc.ticket_id=mt.id) comment_count
     FROM maintenance_tickets mt JOIN properties p ON p.id=mt.property_id
     LEFT JOIN units u ON u.id=mt.unit_id LEFT JOIN tenants t ON t.id=mt.tenant_id LEFT JOIN users assignee ON assignee.id=mt.assigned_to
     WHERE ${scope.clause}
     ORDER BY CASE mt.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,mt.updated_at DESC`,
    scope.params
  );
  const units = all(`SELECT u.id,u.name,u.property_id,p.name property_name FROM units u JOIN properties p ON p.id=u.property_id WHERE ${scope.clause} ORDER BY p.name,u.name`, scope.params);
  const tenants = all(`SELECT t.id,t.full_name,t.property_id,p.name property_name FROM tenants t JOIN properties p ON p.id=t.property_id WHERE ${scope.clause} ORDER BY p.name,t.full_name`, scope.params);
  const propertyIds = properties.map((property) => Number(property.id));
  const team = propertyIds.length ? all(`SELECT DISTINCT u.id,u.name,u.role FROM users u LEFT JOIN user_properties up ON up.user_id=u.id WHERE u.status='active' AND (u.role='owner' OR up.property_id IN (${propertyIds.map(() => "?").join(",")})) ORDER BY u.name`, propertyIds) : all("SELECT id,name,role FROM users WHERE status='active' AND role='owner' ORDER BY name");
  const ticketIds = tickets.map((ticket) => Number(ticket.id));
  const comments = ticketIds.length ? all(
    `SELECT mc.*,u.name user_name,t.full_name tenant_name
     FROM maintenance_comments mc LEFT JOIN users u ON u.id=mc.actor_user_id LEFT JOIN tenants t ON t.id=mc.actor_tenant_id
     WHERE mc.ticket_id IN (${ticketIds.map(() => "?").join(",")}) ORDER BY mc.created_at ASC,mc.id ASC`,
    ticketIds
  ) : [];
  const commentsByTicket = comments.reduce((map, comment) => { const key = Number(comment.ticket_id); if (!map[key]) map[key] = []; map[key].push(comment); return map; }, {});
  const query = await searchParams;
  const columns = [["reported", "Reported"], ["in_progress", "In progress"], ["resolved", "Resolved"]];

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Work orders" title="Maintenance" description="Track reported issues, communicate with residents, and preserve an operational timeline through resolution." actions={<OpenModalButton target="maintenance-modal">Report issue</OpenModalButton>}/>
    {tickets.length ? <div className="kanban">{columns.map(([status, label]) => <section className="kanban-column" key={status}><div className="kanban-head"><h2>{label}</h2><span>{tickets.filter((ticket) => ticket.status === status).length}</span></div><div className="kanban-list">{tickets.filter((ticket) => ticket.status === status).map((ticket) => <article className="ticket-card" key={ticket.id}>
      <div className="ticket-top"><Badge tone={ticket.priority}>{ticket.priority}</Badge><small>{dateTimeLabel(ticket.reported_at)}</small></div><h3>{ticket.title}</h3><p>{ticket.description}</p><div className="ticket-meta"><span>{ticket.property_name}{ticket.unit_name ? ` · ${ticket.unit_name}` : ""}</span><span>{ticket.tenant_name || "No tenant linked"}</span><span>{ticket.assigned_name ? `Assigned to ${ticket.assigned_name}` : "Unassigned"}</span></div>
      <div className="ticket-actions"><OpenModalButton target={`ticket-updates-${ticket.id}`} icon="message" className="text-button">Updates ({ticket.comment_count || 0})</OpenModalButton>{status !== "reported" && <form action={updateMaintenanceAction}><input type="hidden" name="ticketId" value={ticket.id}/><input type="hidden" name="status" value={status === "resolved" ? "in_progress" : "reported"}/><button className="text-button">Move back</button></form>}{status !== "resolved" && <form action={updateMaintenanceAction}><input type="hidden" name="ticketId" value={ticket.id}/><input type="hidden" name="status" value={status === "reported" ? "in_progress" : "resolved"}/><button className="text-button">{status === "reported" ? "Start work" : "Resolve"}</button></form>}</div>
    </article>)}</div></section>)}</div> : <Empty icon="maintenance" title="No maintenance tickets" text="Report an issue and track it through the three-stage operational flow."/>}

    <form action={createMaintenanceAction}><ModalForm id="maintenance-modal" title="Report maintenance issue" description="Capture enough detail for staff to act without a second call." submitLabel="Create ticket"><div className="modal-body"><label><span>Property</span><select name="propertyId" required>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><div className="field-grid two"><label><span>Unit (optional)</span><select name="unitId"><option value="">Common area / property</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.property_name} · {unit.name}</option>)}</select></label><label><span>Tenant (optional)</span><select name="tenantId"><option value="">No tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.property_name} · {tenant.full_name}</option>)}</select></label></div><label><span>Issue title</span><input name="title" required placeholder="Water leak under sink"/></label><label><span>Description</span><textarea name="description" rows="4" required/></label><div className="field-grid two"><label><span>Priority</span><select name="priority" defaultValue="normal"><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></label><label><span>Assign to</span><select name="assignedTo"><option value="">Unassigned</option>{team.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label></div></div></ModalForm></form>

    {tickets.map((ticket) => {
      const timeline = commentsByTicket[Number(ticket.id)] || [];
      return <form action={addStaffMaintenanceCommentAction} key={`updates-${ticket.id}`}><ModalForm id={`ticket-updates-${ticket.id}`} title={`Updates · ${ticket.title}`} description={`${ticket.property_name}${ticket.unit_name ? ` · ${ticket.unit_name}` : ""}${ticket.tenant_name ? ` · ${ticket.tenant_name}` : ""}`} submitLabel="Add update" pendingLabel="Posting…"><div className="modal-body"><input type="hidden" name="ticketId" value={ticket.id}/><div className="maintenance-thread">{timeline.length ? timeline.map((comment) => <div className={`maintenance-thread-item${comment.visibility === "internal" ? " internal" : ""}`} key={comment.id}><span className="portal-comment-avatar">{(comment.user_name || comment.tenant_name || "U").slice(0, 1)}</span><span><strong>{comment.actor_tenant_id ? comment.tenant_name || "Tenant" : comment.user_name || "Former team member"}</strong><small>{dateTimeLabel(comment.created_at)} · {comment.visibility === "internal" ? "Internal note" : "Visible to tenant"}</small><p>{comment.message}</p></span></div>) : <div className="quiet-state">No updates yet.</div>}</div><label><span>New update</span><textarea name="message" rows="4" required placeholder="Add progress, an appointment time, parts ordered, or a resolution note."/></label><label><span>Visibility</span><select name="visibility" defaultValue={ticket.tenant_id ? "tenant" : "internal"}><option value="tenant" disabled={!ticket.tenant_id}>Visible to linked tenant</option><option value="internal">Internal team note</option></select>{!ticket.tenant_id && <small>Link a tenant to the ticket before posting resident-visible updates.</small>}</label></div></ModalForm></form>;
    })}
  </>;
}
