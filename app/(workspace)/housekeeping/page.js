import Link from "next/link";
import { createHousekeepingTaskAction, updateHousekeepingTaskAction } from "@/app/actions";
import { propertyScopeSql, requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { dateTimeLabel } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import ModuleBadge from "@/components/ModuleBadge";
import Icon from "@/components/Icon";
import OperationsBoard from "@/components/OperationsBoard";

export const metadata = { title: "Housekeeping" };

const TASK_TRANSITIONS = Object.freeze({
  open: ["in_progress", "blocked", "completed", "cancelled"],
  in_progress: ["blocked", "completed", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  completed: [],
  cancelled: []
});
const columns = [["open", "Open"], ["in_progress", "In progress"], ["blocked", "Blocked"], ["completed", "Completed"], ["cancelled", "Cancelled"]];
const activeStatuses = new Set(["open", "in_progress", "blocked"]);
const emptyColumnCopy = {
  open: "No new housekeeping tasks.",
  in_progress: "No housekeeping work is currently in progress.",
  blocked: "No housekeeping work is blocked.",
  completed: "No completed housekeeping tasks in this view.",
  cancelled: "No cancelled housekeeping tasks in this view."
};

function statusLabel(status) {
  return status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function taskStatusOptions(status) {
  return [status, ...(TASK_TRANSITIONS[status] || [])];
}

function taskIsOverdue(task, now) {
  if (!activeStatuses.has(task.status) || !task.due_at) return false;
  const due = Date.parse(task.due_at);
  return Number.isFinite(due) && due < now;
}

export default async function HousekeepingPage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const query = await searchParams;
  const properties = all(`SELECT p.* FROM properties p WHERE ${scope.clause} AND p.module_id IN ('hostel','pg_coliving','student_housing','staff_housing') AND p.status='active' ORDER BY p.name`, scope.params);
  const propertyIds = properties.map((property) => Number(property.id));
  const tasks = propertyIds.length ? all(
    `SELECT ht.*,p.name property_name,p.module_id,u.name unit_name,rs.code space_code,r.reference reservation_reference,assignee.name assigned_name
     FROM housekeeping_tasks ht JOIN properties p ON p.id=ht.property_id
     LEFT JOIN units u ON u.id=ht.unit_id LEFT JOIN rentable_spaces rs ON rs.id=ht.space_id
     LEFT JOIN hostel_reservations r ON r.id=ht.reservation_id LEFT JOIN users assignee ON assignee.id=ht.assigned_to
     WHERE ht.property_id IN (${propertyIds.map(() => "?").join(",")})
     ORDER BY CASE ht.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,ht.due_at,ht.id DESC LIMIT 500`, propertyIds
  ) : [];
  const units = propertyIds.length ? all(`SELECT u.id,u.name,u.property_id,p.name property_name FROM units u JOIN properties p ON p.id=u.property_id WHERE u.property_id IN (${propertyIds.map(() => "?").join(",")}) ORDER BY p.name,u.name`, propertyIds) : [];
  const spaces = propertyIds.length ? all(`SELECT rs.id,rs.code,rs.property_id,rs.unit_id,p.name property_name,u.name unit_name FROM rentable_spaces rs JOIN properties p ON p.id=rs.property_id JOIN units u ON u.id=rs.unit_id WHERE rs.property_id IN (${propertyIds.map(() => "?").join(",")}) AND rs.status!='inactive' ORDER BY p.name,u.name,rs.code`, propertyIds) : [];
  const staff = propertyIds.length ? all(`SELECT DISTINCT u.id,u.name FROM users u LEFT JOIN user_properties up ON up.user_id=u.id WHERE u.status='active' AND (u.role='owner' OR up.property_id IN (${propertyIds.map(() => "?").join(",")})) ORDER BY u.name`, propertyIds) : [];
  const manageableProperties = properties.filter((property) => hasPermission(user, "housekeeping.manage", property.id));
  const manageablePropertyIds = new Set(manageableProperties.map((property) => Number(property.id)));
  const manageableUnits = units.filter((unit) => manageablePropertyIds.has(Number(unit.property_id)));
  const manageableSpaces = spaces.filter((space) => manageablePropertyIds.has(Number(space.property_id)));
  const canManage = manageableProperties.length > 0;
  const filters = {
    q: String(query?.q || "").trim().toLowerCase(),
    property: String(query?.property || ""),
    status: columns.some(([status]) => status === String(query?.status || "")) ? String(query.status) : "",
    priority: ["low", "normal", "high", "urgent"].includes(String(query?.priority || "")) ? String(query.priority) : "",
    assignment: ["assigned", "unassigned"].includes(String(query?.assignment || "")) ? String(query.assignment) : ""
  };
  const filteredTasks = tasks.filter((task) => {
    const haystack = `${task.task_type} ${task.notes || ""} ${task.property_name} ${task.unit_name || ""} ${task.space_code || ""} ${task.assigned_name || ""} ${task.reservation_reference || ""}`.toLowerCase();
    const assignmentMatches = !filters.assignment || (filters.assignment === "assigned" ? Boolean(task.assigned_to) : !task.assigned_to);
    return (!filters.q || haystack.includes(filters.q)) && (!filters.property || String(task.property_id) === filters.property) && (!filters.status || task.status === filters.status) && (!filters.priority || task.priority === filters.priority) && assignmentMatches;
  });
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const now = Date.now();
  const activeTasks = tasks.filter((task) => activeStatuses.has(task.status));
  const overdueTasks = activeTasks.filter((task) => taskIsOverdue(task, now)).length;
  const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
  const unassignedTasks = activeTasks.filter((task) => !task.assigned_to).length;
  const boardColumns = columns.map(([id, label]) => ({ id, label, count: filteredTasks.filter((task) => task.status === id).length }));

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Turnover and routine care" title="Housekeeping" description="Coordinate room, bed, locker, linen, inspection and turnover work across hostel, PG, student and staff accommodation properties." actions={canManage ? <OpenModalButton target="housekeeping-create" icon="plus">New task</OpenModalButton> : null}/>

    <section className="metric-grid operations-summary-grid" aria-label="Housekeeping workload summary">
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="maintenance"/></div><span>Active tasks</span><strong>{activeTasks.length}</strong><small>Open, in-progress, or blocked work</small></article>
      <article className={`metric-card compact-metric${overdueTasks ? " risk" : ""}`}><div className="metric-icon"><Icon name="report"/></div><span>Overdue</span><strong>{overdueTasks}</strong><small>Active work beyond its due time</small></article>
      <article className={`metric-card compact-metric${blockedTasks ? " risk" : ""}`}><div className="metric-icon"><Icon name="key"/></div><span>Blocked</span><strong>{blockedTasks}</strong><small>Tasks waiting on access or resolution</small></article>
      <article className={`metric-card compact-metric${unassignedTasks ? " risk" : ""}`}><div className="metric-icon"><Icon name="team"/></div><span>Unassigned</span><strong>{unassignedTasks}</strong><small>Active work without an assignee</small></article>
    </section>

    {tasks.length > 0 && <form className="panel operations-toolbar" method="get" aria-label="Filter housekeeping tasks">
      <div className="operations-toolbar-copy"><span className="eyebrow">Care queue</span><strong>Housekeeping board</strong><small aria-live="polite">{filteredTasks.length} of {tasks.length} tasks shown</small></div>
      <div className="operations-filter-grid housekeeping-filter-grid">
        <label className="operations-search-field"><span>Search tasks</span><input type="search" name="q" defaultValue={query?.q || ""} placeholder="Task, location, assignee, note, or reservation"/></label>
        <label><span>Property</span><select name="property" defaultValue={filters.property}><option value="">All properties</option>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label>
        <label><span>Status</span><select name="status" defaultValue={filters.status}><option value="">All statuses</option>{columns.map(([status, label]) => <option value={status} key={status}>{label}</option>)}</select></label>
        <label><span>Priority</span><select name="priority" defaultValue={filters.priority}><option value="">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label>
        <label><span>Assignment</span><select name="assignment" defaultValue={filters.assignment}><option value="">Any assignment</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select></label>
        <div className="operations-filter-actions"><button className="button secondary" type="submit">Apply filters</button><Link href="/housekeeping" className="text-link">Reset</Link></div>
      </div>
    </form>}

    {filteredTasks.length ? <OperationsBoard id="housekeeping-board" label="Housekeeping status board" columns={boardColumns} className="housekeeping-board enterprise-housekeeping-board">
      {columns.map(([status, label]) => {
        const statusTasks = filteredTasks.filter((task) => task.status === status);
        return <section id={`housekeeping-board-${status}`} data-board-column={status} className="housekeeping-column" key={status} aria-labelledby={`housekeeping-${status}-heading`}>
          <div className="housekeeping-column-head"><div><span className="eyebrow">Task status</span><h2 id={`housekeeping-${status}-heading`}>{label}</h2></div><span>{statusTasks.length}</span></div>
          <div className="housekeeping-list">{statusTasks.length ? statusTasks.map((task) => {
            const editable = hasPermission(user, "housekeeping.manage", task.property_id);
            const overdue = taskIsOverdue(task, now);
            const historical = ["completed", "cancelled"].includes(task.status);
            const titleId = `housekeeping-task-${task.id}`;
            return <article className={`housekeeping-card enterprise-housekeeping-card priority-${task.priority}`} aria-labelledby={titleId} key={task.id}>
              <div className="housekeeping-card-top"><Badge tone={task.priority}>{task.priority}</Badge><ModuleBadge moduleId={task.module_id} compact/></div>
              <h3 id={titleId}>{statusLabel(task.task_type)}</h3><p>{task.property_name}{task.unit_name ? ` · ${task.unit_name}` : ""}{task.space_code ? ` · ${task.space_code}` : ""}</p>
              <div className="housekeeping-context-grid"><span><small>Location</small><strong>{task.unit_name || "Property area"}{task.space_code ? ` · ${task.space_code}` : ""}</strong></span><span className={overdue ? "is-overdue" : ""}><small>Due</small><strong>{task.due_at ? dateTimeLabel(task.due_at) : "No deadline"}</strong></span><span><small>Assignee</small><strong>{task.assigned_name || "Unassigned"}</strong></span><span><small>Source</small><strong>{task.reservation_reference ? `Reservation ${task.reservation_reference}` : "Manual task"}</strong></span></div>
              {task.notes && <p className="housekeeping-note">{task.notes}</p>}
              <div className="housekeeping-actions">{editable && !historical ? <OpenModalButton target={`housekeeping-update-${task.id}`} icon="edit" className="button secondary small">Update task</OpenModalButton> : <span className="operations-history-note">{historical ? "Closed housekeeping record" : "View-only task"}</span>}</div>
            </article>;
          }) : <div className="kanban-empty board-column-empty">{hasActiveFilters ? "No matching tasks in this status." : emptyColumnCopy[status]}</div>}</div>
        </section>;
      })}
    </OperationsBoard> : tasks.length ? <Empty icon="maintenance" title="No housekeeping tasks match these filters" text="Adjust the task search, property, status, priority, or assignment filters to view more work."/> : <Empty icon="maintenance" title="No housekeeping tasks" text={properties.length ? "Create routine work or check out a hostel reservation to generate a turnover automatically." : "Create a compatible accommodation property first."}/>} 

    {canManage && <form action={createHousekeepingTaskAction}><ModalForm id="housekeeping-create" title="Create housekeeping task" description="Link work to a property, room and optional bed so operational ownership is clear." submitLabel="Create task" pendingLabel="Creating…"><div className="modal-body"><label><span>Property</span><select name="propertyId" required>{manageableProperties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label><div className="field-grid two"><label><span>Room / unit</span><select name="unitId"><option value="">Property area</option>{manageableUnits.map((unit) => <option value={unit.id} key={unit.id}>{unit.property_name} · {unit.name}</option>)}</select></label><label><span>Bed / space</span><select name="spaceId"><option value="">No specific space</option>{manageableSpaces.map((space) => <option value={space.id} key={space.id}>{space.property_name} · {space.unit_name} · {space.code}</option>)}</select></label></div><div className="field-grid two"><label><span>Task type</span><select name="taskType"><option value="turnover">Turnover</option><option value="routine_cleaning">Routine cleaning</option><option value="deep_cleaning">Deep cleaning</option><option value="linen_change">Linen change</option><option value="inspection">Inspection</option><option value="locker_reset">Locker reset</option></select></label><label><span>Priority</span><select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></label></div><div className="field-grid two"><label><span>Due date and time</span><input type="datetime-local" name="dueAt"/></label><label><span>Assign to</span><select name="assignedTo"><option value="">Unassigned</option>{staff.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label></div><label><span>Instructions</span><textarea name="notes" rows="4"/></label></div></ModalForm></form>}

    {tasks.filter((task) => hasPermission(user, "housekeeping.manage", task.property_id) && !["completed", "cancelled"].includes(task.status)).map((task) => <form action={updateHousekeepingTaskAction} key={`task-${task.id}`}><ModalForm id={`housekeeping-update-${task.id}`} title={`Update ${statusLabel(task.task_type)}`} description={`${task.property_name}${task.unit_name ? ` · ${task.unit_name}` : ""}`} submitLabel="Save task" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="taskId" value={task.id}/><label><span>Status</span><select name="status" defaultValue={task.status}>{taskStatusOptions(task.status).map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}</select><small>Keep the current status to add an update note without moving the task.</small></label><label><span>Update note</span><textarea name="notes" rows="4" placeholder="Blocker, completion detail, inventory issue, or handover note"/></label></div></ModalForm></form>)}
  </>;
}
