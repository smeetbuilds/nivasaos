import { requireUser } from "@/lib/auth";
import { get } from "@/lib/db";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }) {
  const user = await requireUser();
  const company = get("SELECT value FROM settings WHERE key='company_name'")?.value || "Property portfolio";
  return <AppShell user={user} company={company}>{children}</AppShell>;
}
