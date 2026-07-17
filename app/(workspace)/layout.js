import { requireUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { capabilitiesForModules, modulesForUser } from "@/lib/modules/server";
import { permissionsForUser } from "@/lib/permissions";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }) {
  const user = await requireUser();
  const company = get("SELECT value FROM settings WHERE key='company_name'")?.value || "Property portfolio";
  const modules = modulesForUser(user);
  const capabilities = capabilitiesForModules(modules);
  const permissions = permissionsForUser(user);
  return <AppShell user={user} company={company} modules={modules} capabilities={capabilities} permissions={permissions}>{children}</AppShell>;
}
