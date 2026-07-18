import { createPropertyAction, updatePropertyAction } from "@/app/actions";
import { requireUser, propertyScopeSql } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { hasGlobalPermission } from "@/lib/permission-core";
import { money } from "@/lib/format";
import { enabledModules } from "@/lib/modules/server";
import { moduleById, supportsCapability } from "@/lib/modules/catalog";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import ModuleBadge from "@/components/ModuleBadge";

export const metadata = { title: "Properties" };
const currencies = ["USD", "EUR", "GBP", "INR", "AED", "AUD", "CAD", "SGD"];

export default async function PropertiesPage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const modules = enabledModules();
  const primaryModule = get("SELECT value FROM settings WHERE key='primary_module'")?.value || modules[0]?.id;
  const defaultCountry = get("SELECT value FROM settings WHERE key='default_country'")?.value || "Not specified";
  const defaultCurrency = get("SELECT value FROM settings WHERE key='default_currency'")?.value || "USD";
  const rows = all(
    `SELECT p.*,COUNT(DISTINCT u.id) units,
      SUM(CASE WHEN u.status='occupied' THEN 1 ELSE 0 END) occupied_units,
      (SELECT COUNT(*) FROM rentable_spaces rs WHERE rs.property_id=p.id AND rs.status!='inactive') space_total,
      (SELECT COUNT(*) FROM rentable_spaces rs WHERE rs.property_id=p.id AND rs.status='occupied') space_occupied,
      (SELECT COALESCE(SUM(l.monthly_rent),0) FROM leases l WHERE l.property_id=p.id AND l.status='active') monthly_value,
      (SELECT COUNT(*) FROM invoices i WHERE i.property_id=p.id)+(SELECT COUNT(*) FROM payments pay WHERE pay.property_id=p.id) financial_count,
      COUNT(DISTINCT u.id)+(SELECT COUNT(*) FROM tenants t WHERE t.property_id=p.id)+(SELECT COUNT(*) FROM leases l WHERE l.property_id=p.id)+(SELECT COUNT(*) FROM maintenance_tickets mt WHERE mt.property_id=p.id) operational_count
     FROM properties p LEFT JOIN units u ON u.property_id=p.id
     WHERE ${scope.clause}
     GROUP BY p.id ORDER BY p.name`,
    scope.params
  );
  const query = await searchParams;
  const canEdit = hasGlobalPermission(user, "properties.manage");

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Modular portfolio" title="Properties" description="Each property runs one operating model, while portfolio finance, security, reporting, and audit remain unified." actions={canEdit && <OpenModalButton target="property-modal">Add property</OpenModalButton>}/>
    {rows.length ? <div className="property-grid module-property-grid">{rows.map((row) => {
      const module = moduleById(row.module_id);
      const spaceMode = supportsCapability(module.id, "spaceInventory") && Number(row.space_total || 0) > 0;
      const total = spaceMode ? Number(row.space_total || 0) : Number(row.units || 0);
      const occupied = spaceMode ? Number(row.space_occupied || 0) : Number(row.occupied_units || 0);
      const pct = total ? Math.round(occupied / total * 100) : 0;
      return <article className={`property-card module-property-card module-${module.id}`} key={row.id}>
        <div className="property-cover"><span>{row.name.slice(0, 2).toUpperCase()}</span><Badge tone={row.status}>{row.status}</Badge></div>
        <div className="property-body">
          <ModuleBadge moduleId={module.id}/><h2>{row.name}</h2><p>{row.address}{row.city ? `, ${row.city}` : ""}</p>
          <div className="property-model-copy"><span>{module.family}</span><small>{module.terminology.occupant} · {module.terminology.unit} · {module.terminology.agreement}</small></div>
          <div className="occupancy-line"><span><strong>{occupied}</strong> of {total} {spaceMode ? "spaces" : "units"} occupied</span><strong>{pct}%</strong></div><div className="progress"><i style={{ width: `${pct}%` }}/></div>
          <div className="property-foot"><span>Active contracted value</span><strong>{money(row.monthly_value, row.currency)}/mo</strong></div>
          {canEdit && <div className="record-actions"><OpenModalButton target={`property-edit-${row.id}`} icon="edit" className="text-button">Edit property</OpenModalButton></div>}
        </div>
      </article>;
    })}</div> : <Empty title="No properties yet" text="Create the first property and choose the operating model that controls its inventory, services, workflows, and portal."/>}

    {canEdit && <form action={createPropertyAction}><ModalForm id="property-modal" title="Add a modular property" description="Choose the operating model first. NivasaOS will expose only relevant inventory and operational tools." submitLabel="Create property" pendingLabel="Creating…"><div className="modal-body"><label><span>Property name</span><input name="name" required placeholder="Palm Residency"/></label><label><span>Operating model</span><select name="moduleId" defaultValue={primaryModule}>{modules.map((module) => <option value={module.id} key={module.id}>{module.label} · {module.family}</option>)}</select><small>This locks after units, tenants, leases, invoices, or maintenance activity exists.</small></label><label className="check-row"><input type="checkbox" name="seedTemplate"/><span><strong>Create recommended starter structure</strong><small>Adds model-relevant units, spaces, and service templates with zero pricing.</small></span></label><label><span>Street address</span><input name="address" required/></label><div className="field-grid three"><label><span>City</span><input name="city"/></label><label><span>Country</span><input name="country" defaultValue={defaultCountry}/></label><label><span>Currency</span><select name="currency" defaultValue={defaultCurrency}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label></div></div></ModalForm></form>}

    {canEdit && rows.map((row) => {
      const moduleLocked = Number(row.operational_count || 0) > 0;
      return <form action={updatePropertyAction} key={`edit-${row.id}`}>
        <ModalForm id={`property-edit-${row.id}`} title={`Edit ${row.name}`} description="Identity and module safeguards protect existing operational and financial history." submitLabel="Save property" pendingLabel="Saving…">
          <div className="modal-body"><input type="hidden" name="propertyId" value={row.id}/><label><span>Property name</span><input name="name" defaultValue={row.name} required/></label><label><span>Operating model</span><select name="moduleId" defaultValue={row.module_id || "residential"} disabled={moduleLocked}>{modules.map((module) => <option value={module.id} key={module.id}>{module.label}</option>)}</select>{moduleLocked ? <><input type="hidden" name="moduleId" value={row.module_id || "residential"}/><small>Locked because property inventory or activity exists.</small></> : <small>Can change until the first operational record is created.</small>}</label><div className="field-grid two"><label><span>Currency</span><select name="currency" defaultValue={row.currency} disabled={Boolean(row.financial_count)}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select>{row.financial_count ? <><input type="hidden" name="currency" value={row.currency}/><small>Locked because financial records exist.</small></> : <small>Currency locks after the first invoice or payment.</small>}</label><label><span>Status</span><select name="status" defaultValue={row.status}><option value="active">Active</option><option value="inactive">Inactive</option></select><small>Active leases must end before deactivation.</small></label></div><label><span>Street address</span><input name="address" defaultValue={row.address} required/></label><div className="field-grid two"><label><span>City</span><input name="city" defaultValue={row.city || ""}/></label><label><span>Country</span><input name="country" defaultValue={row.country}/></label></div></div>
        </ModalForm>
      </form>;
    })}
  </>;
}
