import "server-only";
import { run } from "@/lib/db";

function cleanMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const safe = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    safe[key] = value;
  }
  return Object.keys(safe).length ? JSON.stringify(safe) : null;
}

export function changedFields(before, after, fields) {
  return fields.filter((field) => String(before?.[field] ?? "") !== String(after?.[field] ?? ""));
}

export function recordAudit({ actor = null, tenantActor = null, action, entityType, entityId = null, propertyId = null, summary, metadata = null }) {
  const actorUserId = actor?.id ? Number(actor.id) : null;
  const actorTenantId = tenantActor?.tenant_id || tenantActor?.tenantId || tenantActor?.id || null;
  if (!actorUserId && !actorTenantId) throw new Error("Audit actor is required");
  run(
    `INSERT INTO audit_log (actor_user_id,actor_tenant_id,property_id,action,entity_type,entity_id,summary,metadata)
     VALUES ($actorUserId,$actorTenantId,$propertyId,$action,$entityType,$entityId,$summary,$metadata)`,
    {
      actorUserId,
      actorTenantId: actorTenantId ? Number(actorTenantId) : null,
      propertyId: propertyId || null,
      action,
      entityType,
      entityId: entityId || null,
      summary,
      metadata: cleanMetadata(metadata)
    }
  );
}
