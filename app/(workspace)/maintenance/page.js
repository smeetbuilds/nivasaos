import Link from "next/link";
import { addStaffMaintenanceCommentAction, createMaintenanceAction, updateMaintenanceAction } from "@/app/actions";
import { all } from "@/lib/db";
import { dateTimeLabel } from "@/lib/format";
import { permissionScopeSql, requirePortfolioPermission } from "@/lib/permissions";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import StatefulForm from "@/components/StatefulForm";
import ActionButton from "@/components/ActionButton";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import Icon from "@/components/Icon";

export const metadata = { title: "Maintenance" };
const columns = [["reported", "Reported"], ["in_progress", "In progress"], ["resolved", "Resolved"]];

export default async function MaintenancePage({ searchParams }) {
  const user = await requirePortfolioPermission("maintenance.manage");
  const scope = permissionScopeSql(user, "maintenance.manage", "p");
  const properties = all(`SELECT p.* FROM properties p WHERE ${scope.clause} ORDER BY p.name`, scope.params);
  const tickets = all(
    `SELECT mt.*,p.name property_name,u.name unit_name,t.full_name tenant_name,assignee.name assigned_name,
      (SELECT COUNT(*) FROM maintenance_comments mc WHERE mc.ticket_id=mt.id) comment_count
     FROM maintenance_tickets mt JOIN properties p ON p.id=mt.property_id
     LEFT JOIN units u ON u.id=mt.unit_id LEFT JOIN tenants t ON t.id=mt.tenant_id LEFT JOIN users assignee ON assignee.id=mt.assigned_to
     WHERE ${scope.clause}
     ORDER BY CASE mt.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,mt.updated_at DESC`, scope.params
  );
  const units = all(`SELECT u.id,u.name,u.property_id,p.name property_name FROM units u JOIN properties p ON p.id=u.property_id WHERE ${scope.clause} ORDER BY p.name,u.name`, scope.params);
  const tenants = all(`SELECT t.id,t.full_name,t.property_id,p.name property_name FROM tenants t JOIN properties p ON p.id=t.property_id WHERE ${scope.clause} ORDER BY p.name,t.full_name`, scope.params);
  const propertyIds = properties.map((property) => Number(property.id));
  const team = propertyIds.length ? all(`SELECT DISTINCT u.id,u.name,u.role FROM users u LEFT JOIN user_properties up ON up.user_id=u.id WHERE u.status='active' AND (u.role='owner' OR up.property_id IN (${propertyIds.map(() => "?").join(",")})) ORDER BY u.name`, propertyIds) : [];
  const ticketIds = tickets.map((ticket) => Number(ticket.id));
  const comments = ticketIds.length ? all(`SELECT mc.*,u.name user_name,t.full_name tenant_name FROM maintenance_comments mc LEFT JOIN users u ON u.id=mc.actor_user_id LEFT JOIN tenants t ON t.id=mc.actor_tenant_id WHERE mc.ticket_id IN (${ticketIds.map(() => "?").join(",")}) ORDER BY mc.created_at ASC,mc.id ASC`, ticketIds) : [];
  const commentsByTicket = comments.reduce((map, comment) => { const key = Number(comment.ticket_id); if (!map[key]) map[key] = []; map[key].push(comment); return map; }, {});
  const query = await searchParams;
  const filters = {
    q: String(query?.q || "").trim().toLowerCase(),
    property: String(query?.property || ""),
    priority: ["low", "normal", "high", "urgent"].includes(String(query?.priority || "")) ? String(query.priority) : "",
    assignment: ["assigned", "unassigned"].includes(String(query?.assignment || "")) ? String(query.assignment) : ""
  };
  const filteredTickets = tickets.filter((ticket) => {
    const haystack = `${ticket.title} ${ticket.description || ""} ${ticket.property_name} ${ticket.unit_name || ""} ${ticket.tenant_name || ""} ${ticket.assigned_name || ""}`.toLowerCase();
    const assignmentMatches = !filters.assignment || (filters.assignment === "assigned" ? Boolean(ticket.assigned_to) : !ticket.assigned_to);
    return (!filters.q || haystack.includes(filters.q)) && (!filters.property || String(ticket.property_id) === filters.property) && (!filters.priority || ticket.priority === filters.priority) && assignmentMatches;
  });
  const openTickets = tickets.filter((ticket) => ticket.status !== "resolved").length;
  const urgentTickets = tickets.filter((ticket) => ticket.status !== "resolved" && ["urgent", "high"].includes(ticket.priority)).length;
  const unassignedTickets = tickets.filter((ticket) => ticket.status !== "resolved" && !ticket.assigned_to).length;
  const resolvedTickets = tickets.filter((ticket) => ticket.status === "resolved").length;

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Work-order control" title="Maintenance" description="Prioritise reported issues, coordinate assignees, communicate with residents, and preserve a complete operational timeline through resolution." actions={<OpenModalButton target="maintenance-modal" icon="plus">Report issue</OpenModalButton>}/>

    <section className="metric-grid operations-summary-grid" aria-label="Maintenance workload summary">
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="maintenance"/></div><span>Open work orders</span><strong>{openTickets}</strong><small>Reported or currently in progress</small></article>
      <article className={`metric-card compact-metric${urgentTickets ? " risk" : ""}`}><div className="metric-icon"><Icon name="report"/></div><span>High priority</span><strong>{urgentTickets}</strong><small>Urgent and high-priority open work</small></article>
      <article className={`metric-card compact-metric${unassignedTickets ? " risk" : ""}`}><div className="metric-icon"><Icon name="team"/></div><span>Unassigned</span><strong>{unassignedTickets}</strong><small>Open tickets without an owner</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="check"/></div><span>Resolved</span><strong>{resolvedTickets}</strong><small>Preserved in the operational history</small></article>
    </section>

    {tickets.length > 0 && <form className="panel operations-toolbar" method="get" aria-label="Filter maintenance tickets">
      <div className="operations-toolbar-copy"><span className="eyebrow">Work queue</span><strong>Maintenance board</strong><small>{filteredTickets.length} of {tickets.length} tickets shown</small></div>
      <div className="operations-filter-grid maintenance-filter-grid">
        <label className="operations-search-field"><span>Search</span><input type="search" name="q" defaultValue={query?.q || ""} placeholder="Issue, property, unit, person, or assignee"/></label>
        <label><span>Property</span><select name="property" defaultValue={filters.property}><option value="">All properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
        <label><span>Priority</span><select name="priority" defaultValue={filters.priority}><option value="">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label>
        <label><span>Assignment</span><select name="assignment" defaultValue={filters.assignment}><option value="">Any assignment</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select></label>
        <div className="operations-filter-actions"><button className="button secondary" type="submit">Apply</button><Link href="/maintenance" className="text-link">Reset</Link></div>
      </div>
    </form>}

    {filteredTickets.length ? <div className="kanban enterprise-kanban" aria-label="Maintenance workflow board">{columns.map(([status, label]) => {
      const columnTickets = filteredTickets.filter((ticket) => ticket.status === status);
      return <section className="kanban-column enterprise-kanban-column" key={status} aria-labelledby={`maintenance-${status}`}>
        <div className="kanban-head"><div><span className="eyebrow">Workflow</span><h2 id={`maintenance-${status}`}>{label}</h2></div><span>{columnTickets.length}</span></div>
        <div className="kanban-list">{columnTickets.length ? columnTickets.map((ticket) => <article className={`ticket-card enterprise-ticket-card priority-${ticket.priority}`} key={ticket.id}>
          <div className="ticket-top"><Badge tone={ticket.priority}>{ticket.priority}</Badge><small>Updated {dateTimeLabel(ticket.updated_at || ticket.reported_at)}</small></div>
          <h3>{ticket.title}</h3><p>{ticket.description}</p>
          <div className="ticket-context-grid"><span><small>Location</small><strong>{ticket.property_name}{ticket.unit_name ? ` · ${ticket.unit_name}` : ""}</strong></span><span><small>Resident</small><strong>{ticket.tenant_name || "Not linked"}</strong></span><span><small>Owner</small><strong>{ticket.assigned_name || "Unassigned"}</strong></span></div>
          <div className="ticket-actions"><OpenModalButton target={`ticket-updates-${ticket.id}`} icon="message" className="text-button">Updates ({ticket.comment_count || 0})</OpenModalButton>{status !== "reported" && <form action={updateMaintenanceAction}><input type="hidden" name="ticketId" value={ticket.id}/><input type="hidden" name="status" value={status === "resolved" ? "in_progress" : "reported"}/><ActionButton className="text-button" pendingLabel="Moving…">Move back</ActionButton></form>}{status !== "resolved" && <form action={updateMaintenanceAction}><input type="hidden" name="ticketId" value={ticket.id}/><input type="hidden" name="status" value={status === "reported" ? "in_progress" : "resolved"}/><ActionButton className={status === "in_progress" ? "button primary small" : "text-button"} pendingLabel={status === "reported" ? "Starting…" : "Resolving…"}>{status === "reported" ? "Start work" : "Resolve"}</ActionButton></form>}</div>
        </article>) : <div className="kanban-empty">No matching tickets</div>}</div>
      </section>;
    })}</div> : tickets.length ? <Empty icon="maintenance" title="No maintenance tickets match these filters" text="Adjust the search, property, priority, or assignment filters to view more work orders."/> : <Empty icon="maintenance" title="No maintenance tickets" text="Report an issue and track it through the three-stage operational flow."/>}

    <StatefulForm action={createMaintenanceAction}><ModalForm id="maintenance-modal" title="Report maintenance issue" description="Capture enough detail for staff to act without a second call." submitLabel="Create ticket" pendingLabel="Creating…"><div className="modal-body"><label><span>Property</span><select name="propertyId" required>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><div className="field-grid two"><label><span>Unit (optional)</span><select name="unitId"><option value="">Common area / property</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.property_name} · {unit.name}</option>)}</select></label><label><span>Tenant (optional)</span><select name="tenantId"><option value="">No tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.property_name} · {tenant.full_name}</option>)}</select></label></div><label><span>Issue title</span><input name="title" required placeholder="Water leak under sink"/></label><label><span>Description</span><textarea name="description" rows="4" required/></label><div className="field-grid two"><label><span>Priority</span><select name="priority" defaultValue="normal"><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></label><label><span>Assign to</span><select name="assignedTo"><option value="">Unassigned</option>{team.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label></div></div></ModalForm></StatefulForm>

    {tickets.map((ticket) => { const timeline = commentsByTicket[Number(ticket.id)] || []; return <StatefulForm action={addStaffMaintenanceCommentAction} key={`updates-${ticket.id}`}><ModalForm id={`ticket-updates-${ticket.id}`} title={`Updates · ${ticket.title}`} description={`${ticket.property_name}${ticket.unit_name ? ` · ${ticket.unit_name}` : ""}${ticket.tenant_name ? ` · ${ticket.tenant_name}` : ""}`} submitLabel="Add update" pendingLabel="Posting…"><div className="modal-body"><input type="hidden" name="ticketId" value={ticket.id}/><div className="maintenance-thread">{timeline.length ? timeline.map((comment) => <div className={`maintenance-thread-item${comment.visibility === "internal" ? " internal" : ""}`} key={comment.id}><span className="portal-comment-avatar">{(comment.user_name || comment.tenant_name || "U").slice(0, 1)}</span><span><strong>{comment.actor_tenant_id ? comment.tenant_name || "Tenant" : comment.user_name || "Former team member"}</strong><small>{dateTimeLabel(comment.created_at)} · {comment.visibility === "internal" ? "Internal note" : "Visible to tenant"}</small><p>{comment.message}</p></span></div>) : <div className="quiet-state">No updates yet.</div>}</div><label><span>New update</span><textarea name="message" rows="4" required/></label><label><span>Visibility</span><select name="visibility" defaultValue={ticket.tenant_id ? "tenant" : "internal"}><option value="tenant" disabled={!ticket.tenant_id}>Visible to linked tenant</option><option value="internal">Internal team note</option></select></label></div></ModalForm></StatefulForm>; })}
  </>;
}
