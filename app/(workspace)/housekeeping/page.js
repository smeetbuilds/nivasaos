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

export const metadata = { title: "Housekeeping" };

const TASK_TRANSITIONS = Object.freeze({
  open: ["in_progress", "blocked", "completed", "cancelled"],
  in_progress: ["blocked", "completed", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  completed: [],
  cancelled: []
});

function statusLabel(status) {
  return status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function taskStatusOptions(status) {
  return [status, ...(TASK_TRANSITIONS[status] || [])];
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
  const canManage = properties.some((property) => hasPermission(user, "housekeeping.manage", property.id));
  const columns = [["open", "Open"], ["in_progress", "In progress"], ["blocked", "Blocked"], ["completed", "Completed"]];

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Turnover and routine care" title="Housekeeping" description="Coordinate room, bed, locker, linen, inspection and turnover work across hostel, PG, student and staff accommodation properties." actions={canManage && properties.length ? <OpenModalButton target="housekeeping-create">New task</OpenModalButton> : null}/>
    {tasks.length ? <div className="housekeeping-board">{columns.map(([status,label]) => <section className="housekeeping-column" key={status}><div className="housekeeping-column-head"><h2>{label}</h2><span>{tasks.filter((task) => task.status === status).length}</span></div><div className="housekeeping-list">{tasks.filter((task) => task.status === status).map((task) => { const editable=hasPermission(user,"housekeeping.manage",task.property_id); return <article className="housekeeping-card" key={task.id}><div className="housekeeping-card-top"><Badge tone={task.priority}>{task.priority}</Badge><ModuleBadge moduleId={task.module_id} compact/></div><h3>{task.task_type.replaceAll("_"," ")}</h3><p>{task.property_name}{task.unit_name?` · ${task.unit_name}`:""}{task.space_code?` · ${task.space_code}`:""}</p><div className="housekeeping-meta"><span>{task.due_at?`Due ${dateTimeLabel(task.due_at)}`:"No deadline"}</span><span>{task.assigned_name?`Assigned to ${task.assigned_name}`:"Unassigned"}</span>{task.reservation_reference&&<span>From {task.reservation_reference}</span>}</div>{task.notes&&<p className="housekeeping-note">{task.notes}</p>}{editable&&status!=="completed"&&status!=="cancelled"&&<OpenModalButton target={`housekeeping-update-${task.id}`} className="text-button">Update task</OpenModalButton>}</article>; })}</div></section>)}</div> : <Empty icon="maintenance" title="No housekeeping tasks" text={properties.length ? "Create routine work or check out a hostel reservation to generate a turnover automatically." : "Create a compatible accommodation property first."}/>} 

    {canManage && properties.length > 0 && <form action={createHousekeepingTaskAction}><ModalForm id="housekeeping-create" title="Create housekeeping task" description="Link work to a property, room and optional bed so operational ownership is clear." submitLabel="Create task"><div className="modal-body"><label><span>Property</span><select name="propertyId" required>{properties.filter((property)=>hasPermission(user,"housekeeping.manage",property.id)).map((property)=><option value={property.id} key={property.id}>{property.name}</option>)}</select></label><div className="field-grid two"><label><span>Room / unit</span><select name="unitId"><option value="">Property area</option>{units.map((unit)=><option value={unit.id} key={unit.id}>{unit.property_name} · {unit.name}</option>)}</select></label><label><span>Bed / space</span><select name="spaceId"><option value="">No specific space</option>{spaces.map((space)=><option value={space.id} key={space.id}>{space.property_name} · {space.unit_name} · {space.code}</option>)}</select></label></div><div className="field-grid two"><label><span>Task type</span><select name="taskType"><option value="turnover">Turnover</option><option value="routine_cleaning">Routine cleaning</option><option value="deep_cleaning">Deep cleaning</option><option value="linen_change">Linen change</option><option value="inspection">Inspection</option><option value="locker_reset">Locker reset</option></select></label><label><span>Priority</span><select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></label></div><div className="field-grid two"><label><span>Due date and time</span><input type="datetime-local" name="dueAt"/></label><label><span>Assign to</span><select name="assignedTo"><option value="">Unassigned</option>{staff.map((member)=><option value={member.id} key={member.id}>{member.name}</option>)}</select></label></div><label><span>Instructions</span><textarea name="notes" rows="4"/></label></div></ModalForm></form>}

    {tasks.filter((task)=>hasPermission(user,"housekeeping.manage",task.property_id)&&!["completed","cancelled"].includes(task.status)).map((task)=><form action={updateHousekeepingTaskAction} key={`task-${task.id}`}><ModalForm id={`housekeeping-update-${task.id}`} title={`Update ${task.task_type.replaceAll("_"," ")}`} description={`${task.property_name}${task.unit_name?` · ${task.unit_name}`:""}`} submitLabel="Save task"><div className="modal-body"><input type="hidden" name="taskId" value={task.id}/><label><span>Status</span><select name="status" defaultValue={task.status}>{taskStatusOptions(task.status).map((status)=><option value={status} key={status}>{statusLabel(status)}</option>)}</select><small>Keep the current status to add an update note without moving the task.</small></label><label><span>Update note</span><textarea name="notes" rows="4" placeholder="Blocker, completion detail, inventory issue, or handover note"/></label></div></ModalForm></form>)}
  </>;
}
