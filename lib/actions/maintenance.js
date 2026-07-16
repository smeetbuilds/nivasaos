import { revalidatePath } from "next/cache";
import { canAccessProperty, requireUser } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { assertProperty, choice, integer, safeRedirect, text } from "@/lib/actions/shared";

function refreshMaintenanceViews() {
  ["/maintenance", "/dashboard", "/audit", "/portal", "/portal/maintenance"].forEach(revalidatePath);
}

export async function createMaintenanceAction(formData) {
  const actor = await requireUser();
  const propertyId = await assertProperty(formData, actor);
  const unitId = integer(formData, "unitId") || null;
  const tenantId = integer(formData, "tenantId") || null;
  const assignedTo = integer(formData, "assignedTo") || null;
  if (unitId && !get("SELECT 1 FROM units WHERE id=$unitId AND property_id=$propertyId", { unitId, propertyId })) throw new Error("Invalid unit");
  if (tenantId && !get("SELECT 1 FROM tenants WHERE id=$tenantId AND property_id=$propertyId", { tenantId, propertyId })) throw new Error("Invalid tenant");
  if (assignedTo && !get(`SELECT 1 FROM users u WHERE u.id=$assignedTo AND u.status='active'
    AND (u.role='owner' OR EXISTS (SELECT 1 FROM user_properties up WHERE up.user_id=u.id AND up.property_id=$propertyId))`, { assignedTo, propertyId })) {
    throw new Error("Assignee does not have access to this property");
  }
  const title = text(formData, "title", true);
  const description = text(formData, "description", true);
  const priority = choice(formData, "priority", ["low", "normal", "high", "urgent"], "normal");
  transaction(() => {
    const result = run(
      `INSERT INTO maintenance_tickets (property_id,unit_id,tenant_id,title,description,priority,status,assigned_to)
       VALUES ($propertyId,$unitId,$tenantId,$title,$description,$priority,'reported',$assignedTo)`,
      { propertyId, unitId, tenantId, title, description, priority, assignedTo }
    );
    const ticketId = Number(result.lastInsertRowid);
    if (tenantId) {
      run(
        `INSERT INTO maintenance_comments (ticket_id,actor_user_id,message,visibility)
         VALUES ($ticketId,$userId,$message,'tenant')`,
        { ticketId, userId: actor.id, message: "Your property team created this maintenance request and will post updates here." }
      );
    }
    recordAudit({ actor, action: "create", entityType: "maintenance_ticket", entityId: ticketId, propertyId, summary: `Reported maintenance issue: ${title}`, metadata: { priority, unitId, assignedTo, tenantVisible: Boolean(tenantId) } });
  });
  refreshMaintenanceViews();
  safeRedirect("/maintenance", "Maintenance ticket reported");
}

export async function updateMaintenanceAction(formData) {
  const actor = await requireUser();
  const ticketId = integer(formData, "ticketId");
  const status = choice(formData, "status", ["reported", "in_progress", "resolved"]);
  const ticket = get("SELECT * FROM maintenance_tickets WHERE id=$ticketId", { ticketId });
  if (!ticket || !canAccessProperty(actor, ticket.property_id)) throw new Error("Ticket access denied");
  if (ticket.status === status) safeRedirect("/maintenance", "Ticket status is unchanged");
  transaction(() => {
    run(
      "UPDATE maintenance_tickets SET status=$status,resolved_at=CASE WHEN $status='resolved' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=$ticketId",
      { status, ticketId }
    );
    if (ticket.tenant_id) {
      const label = status === "in_progress" ? "Work has started on this issue." : status === "resolved" ? "This issue was marked resolved." : "This issue was moved back to reported.";
      run(
        `INSERT INTO maintenance_comments (ticket_id,actor_user_id,message,visibility)
         VALUES ($ticketId,$userId,$message,'tenant')`,
        { ticketId, userId: actor.id, message: label }
      );
    }
    recordAudit({ actor, action: "status", entityType: "maintenance_ticket", entityId: ticketId, propertyId: ticket.property_id, summary: `Moved maintenance ticket to ${status.replaceAll("_", " ")}`, metadata: { from: ticket.status, to: status } });
  });
  refreshMaintenanceViews();
  safeRedirect("/maintenance", "Ticket updated");
}
