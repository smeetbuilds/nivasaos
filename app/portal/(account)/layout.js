import { requireTenant } from "@/lib/tenant-auth";
import { get } from "@/lib/db";
import { loadBranding } from "@/lib/branding";
import { moduleById } from "@/lib/modules/catalog";
import TenantPortalShell from "@/components/TenantPortalShell";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PortalAccountLayout({ children }) {
  const tenant = await requireTenant();
  const company = get("SELECT value FROM settings WHERE key='company_name'")?.value || tenant.property_name || "Resident portal";
  const branding = loadBranding();
  const module = moduleById(tenant.module_id);
  return <TenantPortalShell tenant={tenant} company={company} branding={branding} module={module}>{children}</TenantPortalShell>;
}
