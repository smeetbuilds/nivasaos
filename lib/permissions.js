import "server-only";
import { redirect } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireUser, canAccessProperty } from "@/lib/auth";
import { PERMISSIONS, ROLE_PERMISSION_DEFAULTS } from "@/lib/verticals";

export function permissionsForUser(user, propertyId = null) {
  const defaults = new Set(ROLE_PERMISSION_DEFAULTS[user?.role] || []);
  if (!user?.id) return [];
  const grants = all(
    `SELECT permission,allowed FROM permission_grants
     WHERE user_id=$userId AND (property_id IS NULL OR property_id=$propertyId)
     ORDER BY CASE WHEN property_id IS NULL THEN 0 ELSE 1 END`,
    { userId: Number(user.id), propertyId: propertyId ? Number(propertyId) : -1 }
  );
  for (const grant of grants) {
    if (!PERMISSIONS.includes(grant.permission)) continue;
    if (Number(grant.allowed) === 1) defaults.add(grant.permission); else defaults.delete(grant.permission);
  }
  return [...defaults];
}

export function portfolioPermissionsForUser(user) {
  if (!user?.id) return [];
  if (user.role === "owner") return [...PERMISSIONS];
  const propertyIds = all("SELECT property_id FROM user_properties WHERE user_id=$userId ORDER BY property_id", { userId: Number(user.id) }).map((row) => Number(row.property_id));
  const union = new Set(permissionsForUser(user));
  for (const propertyId of propertyIds) for (const permission of permissionsForUser(user, propertyId)) union.add(permission);
  return [...union];
}

export function hasPermission(user, permission, propertyId = null) {
  if (!PERMISSIONS.includes(permission)) return false;
  if (propertyId && !canAccessProperty(user, propertyId)) return false;
  return permissionsForUser(user, propertyId).includes(permission);
}

export async function requirePermission(permission, propertyId = null) {
  const user = await requireUser();
  if (!hasPermission(user, permission, propertyId)) redirect("/dashboard?error=forbidden");
  return user;
}

export function userPermissionSummary(userId) {
  const user = get("SELECT id,name,email,role,status FROM users WHERE id=$userId", { userId: Number(userId) });
  if (!user) return null;
  return { ...user, permissions: portfolioPermissionsForUser(user) };
}
