import "server-only";
import { redirect } from "next/navigation";
import { get } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export * from "@/lib/permission-core";

import {
  PROPERTY_SCOPED_PERMISSIONS,
  propertyIdsForPermission,
  permissionScopeSql,
  hasPermission,
  hasPortfolioPermission,
  hasPortfolioRequirements,
  portfolioPermissionsForUser
} from "@/lib/permission-core";

void PROPERTY_SCOPED_PERMISSIONS;
void propertyIdsForPermission;
void permissionScopeSql;

export async function requirePermission(permission, propertyId = null) {
  const user = await requireUser();
  if (!hasPermission(user, permission, propertyId)) redirect("/forbidden");
  return user;
}

export async function requirePortfolioPermission(permission) {
  const user = await requireUser();
  if (!hasPortfolioPermission(user, permission)) redirect("/forbidden");
  return user;
}

export async function requirePortfolioRequirements(requirements) {
  const user = await requireUser();
  if (!hasPortfolioRequirements(user, requirements)) redirect("/forbidden");
  return user;
}

export function userPermissionSummary(userId) {
  const user = get("SELECT id,name,email,role,status FROM users WHERE id=$userId", { userId: Number(userId) });
  if (!user) return null;
  return { ...user, permissions: portfolioPermissionsForUser(user) };
}
