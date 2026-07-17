import { requireUser } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { assertPermission } from "@/lib/permissions";
import { choice, integer, safeRedirect } from "@/lib/actions/shared";
import { portalLease, portalTicket, requireTenant } from "@/lib/tenant-auth";
import { limitedText, refreshPortalViews } from "@/lib/actions/portal-common";

export async function createTenantMaintenanceAction(formData) {
  const tenant = await requireTenant();
  const leaseId = integer(formData, "leaseId");
  const lease = portalLease(tenant.tenant_id, leaseId);
  if (!lease || lease.status !== "active") throw new Error("Select an active home");
  const title = limitedText(formData, "title", 160, true);
  const description = limitedText(formData, "description", 5000, true);
  const priority = choice(formData, "priority", ["low", "normal", "high", "urgent"], "normal");
  transaction(() => {
    const result = run(`INSERT INTO maintenance_tickets (property_id,unit_id,tenant_id,title,description,priority,status) VALUES ($propertyId,$unitId,$tenantId,$title,$description,$priority,'reported')`, { propertyId: lease.property_id, unitId: lease.unit_id, tenantId: tenant.tenant_id, title, description, priority });
    const ticketId = Number(result.lastInsertRowid);
    recordAudit({ tenantActor: tenant, action: "create", entityType: "maintenance_ticket", entityId: ticketId, propertyId: lease.property_id, summary: `${tenant.full_name} reported maintenance: ${title}`, metadata: { priority, unitId: lease.unit_id } });
  });
  refreshPortalViews();
  safeRedirect("/portal/maintenance", "Maintenance issue reported");
}

export async function addTenantMaintenanceCommentAction(formData) {
  const tenant = await requireTenant();
  const ticketId = integer(formData, "ticketId");
  const ticket = portalTicket(tenant.tenant_id, ticketId);
  if (!ticket) throw new Error("Ticket access denied");
  if (ticket.status === "resolved") throw new Error("Resolved tickets cannot receive tenant replies");
  const message = limitedText(formData, "message", 4000, true);
  transaction(() => {
    const result = run(`INSERT INTO maintenance_comments (ticket_id,actor_tenant_id,message,visibility) VALUES ($ticketId,$tenantId,$message,'tenant')`, { ticketId, tenantId: tenant.tenant_id, message });
    run("UPDATE maintenance_tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=$ticketId", { ticketId });
    recordAudit({ tenantActor: tenant, action: "update", entityType: "maintenance_comment", entityId: Number(result.lastInsertRowid), propertyId: ticket.property_id, summary: `${tenant.full_name} added a maintenance update`, metadata: { ticketId } });
  });
  refreshPortalViews();
  safeRedirect("/portal/maintenance", "Update added");
}

export async function addStaffMaintenanceCommentAction(formData) {
  const actor = await requireUser();
  const ticketId = integer(formData, "ticketId");
  const ticket = get("SELECT * FROM maintenance_tickets WHERE id=$ticketId", { ticketId });
  if (!ticket) throw new Error("Ticket not found");
  assertPermission(actor, "maintenance.manage", ticket.property_id);
  const message = limitedText(formData, "message", 4000, true);
  const visibility = choice(formData, "visibility", ["tenant", "internal"], "tenant");
  transaction(() => {
    const result = run(`INSERT INTO maintenance_comments (ticket_id,actor_user_id,message,visibility) VALUES ($ticketId,$userId,$message,$visibility)`, { ticketId, userId: actor.id, message, visibility });
    run("UPDATE maintenance_tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=$ticketId", { ticketId });
    recordAudit({ actor, action: "update", entityType: "maintenance_comment", entityId: Number(result.lastInsertRowid), propertyId: ticket.property_id, summary: `Added ${visibility === "internal" ? "internal" : "tenant-visible"} maintenance update`, metadata: { ticketId } });
  });
  refreshPortalViews();
  safeRedirect("/maintenance", "Maintenance update added");
}
