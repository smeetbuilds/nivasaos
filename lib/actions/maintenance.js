import { revalidatePath } from "next/cache";
import { canAccessProperty, requireUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { assertProperty, integer, safeRedirect, text } from "@/lib/actions/shared";

export async function createMaintenanceAction(formData) {
  const user = await requireUser();
  const propertyId = await assertProperty(formData, user);
  const unitId = integer(formData, "unitId") || null;
  const tenantId = integer(formData, "tenantId") || null;
  const assignedTo = integer(formData, "assignedTo") || null;
  if (unitId && !get("SELECT 1 FROM units WHERE id=$unitId AND property_id=$propertyId", { unitId, propertyId })) throw new Error("Invalid unit");
  if (tenantId && !get("SELECT 1 FROM tenants WHERE id=$tenantId AND property_id=$propertyId", { tenantId, propertyId })) throw new Error("Invalid tenant");
  if (assignedTo && !get(`SELECT 1 FROM users u WHERE u.id=$assignedTo AND u.status='active'
    AND (u.role='owner' OR EXISTS (SELECT 1 FROM user_properties up WHERE up.user_id=u.id AND up.property_id=$propertyId))`, { assignedTo, propertyId })) {
    throw new Error("Assignee does not have access to this property");
  }
  run(
    `INSERT INTO maintenance_tickets (property_id,unit_id,tenant_id,title,description,priority,status,assigned_to)
     VALUES ($propertyId,$unitId,$tenantId,$title,$description,$priority,'reported',$assignedTo)`,
    {
      propertyId, unitId, tenantId,
      title: text(formData, "title", true),
      description: text(formData, "description", true),
      priority: text(formData, "priority") || "normal",
      assignedTo
    }
  );
  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  safeRedirect("/maintenance", "Maintenance ticket reported");
}

export async function updateMaintenanceAction(formData) {
  const user = await requireUser();
  const ticketId = integer(formData, "ticketId");
  const status = text(formData, "status", true);
  if (!["reported", "in_progress", "resolved"].includes(status)) throw new Error("Invalid status");
  const ticket = get("SELECT * FROM maintenance_tickets WHERE id=$ticketId", { ticketId });
  if (!ticket || !canAccessProperty(user, ticket.property_id)) throw new Error("Ticket access denied");
  run(
    "UPDATE maintenance_tickets SET status=$status,resolved_at=CASE WHEN $status='resolved' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=$ticketId",
    { status, ticketId }
  );
  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  safeRedirect("/maintenance", "Ticket updated");
}
