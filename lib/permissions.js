import "server-only";
import { redirect } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireUser, canAccessProperty } from "@/lib/auth";
import { PERMISSIONS, ROLE_PERMISSION_DEFAULTS } from "@/lib/verticals";

export const PROPERTY_SCOPED_PERMISSIONS = Object.freeze([
  "portfolio.view", "people.manage", "agreements.manage", "billing.manage", "payments.manage", "services.manage",
  "visitors.manage", "maintenance.manage", "handover.manage", "verticals.manage", "requests.review", "reservations.manage",
  "housekeeping.manage", "reports.view"
]);

const propertyScoped = new Set(PROPERTY_SCOPED_PERMISSIONS);

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

export function hasPermission(user, permission, propertyId = null) {
  if (!PERMISSIONS.includes(permission)) return false;
  if (propertyId && !canAccessProperty(user, propertyId)) return false;
  return permissionsForUser(user, propertyId).includes(permission);
}

export function propertyIdsForPermission(user, permission) {
  if (!user?.id || !PERMISSIONS.includes(permission)) return [];
  const rows = user.role === "owner"
    ? all("SELECT id FROM properties ORDER BY id")
    : all(
      `SELECT p.id FROM properties p
       JOIN user_properties up ON up.property_id=p.id
       WHERE up.user_id=$userId ORDER BY p.id`,
      { userId: Number(user.id) }
    );
  return rows.map((row) => Number(row.id)).filter((propertyId) => hasPermission(user, permission, propertyId));
}

export function permissionScopeSql(user, permission, alias = "p") {
  const propertyIds = propertyIdsForPermission(user, permission);
  if (!propertyIds.length) return { clause: "0=1", params: {}, propertyIds: [] };
  const params = {};
  const placeholders = propertyIds.map((propertyId, index) => {
    const key = `permissionProperty${index}`;
    params[key] = propertyId;
    return `$${key}`;
  });
  return { clause: `${alias}.id IN (${placeholders.join(",")})`, params, propertyIds };
}

export function hasPortfolioPermission(user, permission) {
  if (!PERMISSIONS.includes(permission)) return false;
  if (user?.role === "owner") return true;
  if (propertyScoped.has(permission)) return propertyIdsForPermission(user, permission).length > 0;
  return permissionsForUser(user).includes(permission);
}

export function portfolioPermissionsForUser(user) {
  if (!user?.id) return [];
  if (user.role === "owner") return [...PERMISSIONS];
  const union = new Set(permissionsForUser(user).filter((permission) => !propertyScoped.has(permission)));
  for (const propertyId of propertyIdsForPermission(user, "portfolio.view")) {
    for (const permission of permissionsForUser(user, propertyId)) union.add(permission);
  }
  for (const permission of PROPERTY_SCOPED_PERMISSIONS) {
    if (propertyIdsForPermission(user, permission).length) union.add(permission); else union.delete(permission);
  }
  return [...union];
}

export function assertPermission(user, permission, propertyId) {
  if (!propertyId || !hasPermission(user, permission, propertyId)) throw new Error("Permission denied for this property");
  return Number(propertyId);
}

export function assertPortfolioPermission(user, permission) {
  if (!hasPortfolioPermission(user, permission)) throw new Error("Permission denied");
  return user;
}

export async function requirePermission(permission, propertyId = null) {
  const user = await requireUser();
  if (!hasPermission(user, permission, propertyId)) redirect("/dashboard?error=forbidden");
  return user;
}

export async function requirePortfolioPermission(permission) {
  const user = await requireUser();
  if (!hasPortfolioPermission(user, permission)) redirect("/dashboard?error=forbidden");
  return user;
}

export function userPermissionSummary(userId) {
  const user = get("SELECT id,name,email,role,status FROM users WHERE id=$userId", { userId: Number(userId) });
  if (!user) return null;
  return { ...user, permissions: portfolioPermissionsForUser(user) };
}
