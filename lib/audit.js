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

export function recordAudit({ actor, action, entityType, entityId = null, propertyId = null, summary, metadata = null }) {
  if (!actor?.id) throw new Error("Audit actor is required");
  run(
    `INSERT INTO audit_log (actor_user_id,property_id,action,entity_type,entity_id,summary,metadata)
     VALUES ($actorUserId,$propertyId,$action,$entityType,$entityId,$summary,$metadata)`,
    {
      actorUserId: actor.id,
      propertyId: propertyId || null,
      action,
      entityType,
      entityId: entityId || null,
      summary,
      metadata: cleanMetadata(metadata)
    }
  );
}
