import { updateWorkspaceModulesAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { moduleSummary } from "@/lib/modules/server";
import PageHeader from "@/components/PageHeader";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Icon from "@/components/Icon";

export const metadata = { title: "Operating modules" };

export default async function ModulesPage({ searchParams }) {
  const user = await requireUser();
  const modules = moduleSummary();
  const primary = get("SELECT value FROM settings WHERE key='primary_module'")?.value || modules.find((module) => module.enabled)?.id;
  const editable = user.role === "owner";
  const query = await searchParams;
  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Portfolio architecture" title="Operating modules" description="Enable the operating models your portfolio needs. Properties remain independently assigned, while core finance, security, audit, maintenance, and portals stay unified."/>
    <form action={updateWorkspaceModulesAction} className="module-governance-form">
      <section className="module-governance-grid">
        {modules.map((module) => <label className={`module-governance-card module-${module.id}${module.enabled ? " is-enabled" : ""}`} key={module.id}>
          <span className="module-card-top"><span className="module-selector-icon"><Icon name={module.icon} size={24}/></span><span>{module.enabled ? <Badge tone="active">Enabled</Badge> : <Badge tone="inactive">Disabled</Badge>}</span></span>
          <input type="checkbox" name="moduleIds" value={module.id} defaultChecked={module.enabled} disabled={!editable}/>
          <span className="eyebrow">{module.family}</span><h2>{module.label}</h2><p>{module.description}</p>
          <div className="module-capabilities">{module.capabilities.map((capability) => <span key={capability}>{capability.replace(/([A-Z])/g, " $1")}</span>)}</div>
          <div className="module-card-foot"><span><small>Properties using module</small><strong>{module.propertyCount}</strong></span><span><small>Portal language</small><strong>{module.terminology.portal}</strong></span></div>
        </label>)}
      </section>
      <section className="panel module-primary-panel"><div><span className="eyebrow">Workspace default</span><h2>Primary operating model</h2><p>Choose from the complete catalogue so a newly enabled module can become primary in the same save. The server rejects a primary module that is not checked above.</p></div><label><span>Primary module</span><select name="primaryModule" defaultValue={primary} disabled={!editable}>{modules.map((module) => <option value={module.id} key={module.id}>{module.label}{module.enabled ? "" : " · enable above"}</option>)}</select></label>{editable ? <button className="button primary" type="submit">Save module architecture</button> : <Badge tone="staff">Owner only</Badge>}</section>
    </form>
    <section className="module-architecture-note"><Icon name="audit" size={20}/><div><strong>Deactivation is intentionally strict</strong><p>A module cannot be disabled while a property uses it. Move or retire those properties first so their inventory, service, visitor, and portal records never become inaccessible.</p></div></section>
  </>;
}
