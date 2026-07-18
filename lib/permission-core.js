import "server-only";
import { all, get } from "@/lib/db";
import { PERMISSIONS, ROLE_PERMISSION_DEFAULTS } from "@/lib/verticals";
import { normalizePermissionRequirements } from "@/lib/permission-context";

export const PROPERTY_SCOPED_PERMISSIONS = Object.freeze([
  "portfolio.view", "inventory.manage", "people.manage", "agreements.manage", "billing.manage", "payments.manage",
  "deposits.manage", "portal.manage", "services.manage", "visitors.manage", "maintenance.manage", "handover.manage",
  "verticals.manage", "requests.review", "reservations.manage", "housekeeping.manage", "reports.view", "audit.view"
]);

const propertyScoped = new Set(PROPERTY_SCOPED_PERMISSIONS);

function assignedPropertyIds(user) {
  if (!user?.id) return [];
  const rows = user.role === "owner"
    ? all("SELECT id FROM properties ORDER BY id")
    : all(
      `SELECT p.id FROM properties p
       JOIN user_properties up ON up.property_id=p.id
       WHERE up.user_id=$userId ORDER BY p.id`,
      { userId: Number(user.id) }
    );
  return rows.map((row) => Number(row.id));
}

function assignedToProperty(user, propertyId) {
  if (user?.role === "owner") return true;
  return Boolean(get(
    "SELECT 1 FROM user_properties WHERE user_id=$userId AND property_id=$propertyId",
    { userId: Number(user?.id || 0), propertyId: Number(propertyId) }
  ));
}

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
  if (propertyId && !assignedToProperty(user, propertyId)) return false;
  return permissionsForUser(user, propertyId).includes(permission);
}

export function hasGlobalPermission(user, permission) {
  if (!PERMISSIONS.includes(permission)) return false;
  if (user?.role === "owner") return true;
  return permissionsForUser(user).includes(permission);
}

export function propertyIdsForPermission(user, permission) {
  if (!user?.id || !PERMISSIONS.includes(permission)) return [];
  return assignedPropertyIds(user).filter((propertyId) => hasPermission(user, permission, propertyId));
}

export function propertyIdsForRequirements(user, requirements) {
  const { allOf, anyOf } = normalizePermissionRequirements(requirements);
  return assignedPropertyIds(user).filter((propertyId) => {
    const allAllowed = allOf.every((permission) => hasPermission(user, permission, propertyId));
    const anyAllowed = anyOf.length === 0 || anyOf.some((permission) => hasPermission(user, permission, propertyId));
    return allAllowed && anyAllowed;
  });
}

function scopeFromPropertyIds(propertyIds, alias) {
  if (!propertyIds.length) return { clause: "0=1", params: {}, propertyIds: [] };
  const params = {};
  const placeholders = propertyIds.map((propertyId, index) => {
    const key = `permissionProperty${index}`;
    params[key] = propertyId;
    return `$${key}`;
  });
  return { clause: `${alias}.id IN (${placeholders.join(",")})`, params, propertyIds };
}

export function permissionScopeSql(user, permission, alias = "p") {
  return scopeFromPropertyIds(propertyIdsForPermission(user, permission), alias);
}

export function permissionRequirementsScopeSql(user, requirements, alias = "p") {
  if (user?.role === "owner") return { clause: "1=1", params: {}, propertyIds: assignedPropertyIds(user) };
  return scopeFromPropertyIds(propertyIdsForRequirements(user, requirements), alias);
}

export function hasPortfolioPermission(user, permission) {
  if (!PERMISSIONS.includes(permission)) return false;
  if (user?.role === "owner") return true;
  if (propertyScoped.has(permission)) return propertyIdsForPermission(user, permission).length > 0;
  return hasGlobalPermission(user, permission);
}

export function hasPortfolioRequirements(user, requirements) {
  if (user?.role === "owner") return true;
  const { allOf, anyOf } = normalizePermissionRequirements(requirements);
  const globalAll = allOf.filter((permission) => !propertyScoped.has(permission));
  const globalAny = anyOf.filter((permission) => !propertyScoped.has(permission));
  if (!globalAll.every((permission) => hasGlobalPermission(user, permission))) return false;
  if (globalAny.length && !globalAny.some((permission) => hasGlobalPermission(user, permission))) return false;
  const scopedAll = allOf.filter((permission) => propertyScoped.has(permission));
  const scopedAny = anyOf.filter((permission) => propertyScoped.has(permission));
  if (!scopedAll.length && !scopedAny.length) return true;
  return propertyIdsForRequirements(user, { allOf: scopedAll, anyOf: scopedAny }).length > 0;
}

export function portfolioPermissionsForUser(user) {
  if (!user?.id) return [];
  if (user.role === "owner") return [...PERMISSIONS];
  const union = new Set(permissionsForUser(user).filter((permission) => !propertyScoped.has(permission)));
  for (const permission of PROPERTY_SCOPED_PERMISSIONS) {
    if (propertyIdsForPermission(user, permission).length) union.add(permission); else union.delete(permission);
  }
  return [...union];
}

export function assertPermission(user, permission, propertyId) {
  if (!propertyId || !hasPermission(user, permission, propertyId)) throw new Error("Permission denied for this property");
  return Number(propertyId);
}

export function assertGlobalPermission(user, permission) {
  if (!hasGlobalPermission(user, permission)) throw new Error("Permission denied");
  return user;
}

export function assertPortfolioPermission(user, permission) {
  if (!hasPortfolioPermission(user, permission)) throw new Error("Permission denied");
  return user;
}

export function assertPortfolioRequirements(user, requirements) {
  if (!hasPortfolioRequirements(user, requirements)) throw new Error("Permission denied");
  return user;
}
