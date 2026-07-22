import { updateWorkspaceModulesAction } from "@/app/actions";
import { get } from "@/lib/db";
import { requirePortfolioPermission } from "@/lib/permissions";
import { moduleSummary } from "@/lib/modules/server";
import PageHeader from "@/components/PageHeader";
import Flash from "@/components/Flash";
import Icon from "@/components/Icon";
import ModuleGovernanceForm from "@/components/ModuleGovernanceForm";

export const metadata = { title: "Operating modules" };

export default async function ModulesPage({ searchParams }) {
  await requirePortfolioPermission("settings.manage");
  const modules = moduleSummary();
  const primary = get("SELECT value FROM settings WHERE key='primary_module'")?.value || modules.find((module) => module.enabled)?.id;
  const query = await searchParams;
  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Portfolio architecture" title="Operating modules" description="Enable the operating models your portfolio needs. Properties remain independently assigned, while core finance, security, audit, maintenance, and portals stay unified."/>
    <ModuleGovernanceForm modules={modules} primary={primary} action={updateWorkspaceModulesAction}/>
    <section className="module-architecture-note" aria-label="Module deactivation safeguard"><Icon name="audit" size={20}/><div><strong>Deactivation is intentionally strict</strong><p>A module cannot be disabled while a property uses it. Move or retire those properties first so their inventory, service, visitor, and portal records never become inaccessible.</p></div></section>
  </>;
}
