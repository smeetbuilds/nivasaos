import Link from "next/link";
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
import Icon from "@/components/Icon";

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
  const filters = {
    q: String(query?.q || "").trim().toLowerCase(),
    status: String(query?.status || ""),
    module: String(query?.module || "")
  };
  const filteredRows = rows.filter((row) => {
    const module = moduleById(row.module_id);
    const haystack = `${row.name} ${row.address || ""} ${row.city || ""} ${row.country || ""} ${module.label}`.toLowerCase();
    return (!filters.q || haystack.includes(filters.q)) && (!filters.status || row.status === filters.status) && (!filters.module || module.id === filters.module);
  });
  const inventory = rows.reduce((summary, row) => {
    const module = moduleById(row.module_id);
    const spaceMode = supportsCapability(module.id, "spaceInventory") && Number(row.space_total || 0) > 0;
    summary.total += spaceMode ? Number(row.space_total || 0) : Number(row.units || 0);
    summary.occupied += spaceMode ? Number(row.space_occupied || 0) : Number(row.occupied_units || 0);
    return summary;
  }, { total: 0, occupied: 0 });
  const portfolioOccupancy = inventory.total ? Math.round(inventory.occupied / inventory.total * 100) : 0;
  const activeProperties = rows.filter((row) => row.status === "active").length;
  const operatingModels = new Set(rows.map((row) => moduleById(row.module_id).id)).size;

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Portfolio architecture" title="Properties" description="Manage each site under the correct operating model while keeping finance, security, reporting, and audit unified across the portfolio." actions={canEdit && <OpenModalButton target="property-modal" icon="plus">Add property</OpenModalButton>}/>

    <section className="metric-grid portfolio-summary-grid" aria-label="Property portfolio summary">
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="property"/></div><span>Properties</span><strong>{rows.length}</strong><small>{activeProperties} active in your scope</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="modules"/></div><span>Operating models</span><strong>{operatingModels}</strong><small>Across enabled property types</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="unit"/></div><span>Managed inventory</span><strong>{inventory.total}</strong><small>Units, beds, spaces, or commercial inventory</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="report"/></div><span>Portfolio occupancy</span><strong>{portfolioOccupancy}%</strong><small>{inventory.occupied} currently occupied</small></article>
    </section>

    {rows.length > 0 && <form className="panel portfolio-toolbar" method="get" aria-label="Filter properties">
      <div className="portfolio-toolbar-copy"><span className="eyebrow">Directory</span><strong>Property portfolio</strong><small>{filteredRows.length} of {rows.length} properties shown</small></div>
      <div className="portfolio-filter-grid property-filter-grid">
        <label className="portfolio-search-field"><span>Search</span><input type="search" name="q" defaultValue={query?.q || ""} placeholder="Name, location, or model"/></label>
        <label><span>Status</span><select name="status" defaultValue={filters.status}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label><span>Operating model</span><select name="module" defaultValue={filters.module}><option value="">All models</option>{modules.map((module) => <option value={module.id} key={module.id}>{module.label}</option>)}</select></label>
        <div className="portfolio-filter-actions"><button className="button secondary" type="submit">Apply</button><Link href="/properties" className="text-link">Reset</Link></div>
      </div>
    </form>}

    {filteredRows.length ? <div className="property-grid module-property-grid enterprise-property-grid">{filteredRows.map((row) => {
      const module = moduleById(row.module_id);
      const spaceMode = supportsCapability(module.id, "spaceInventory") && Number(row.space_total || 0) > 0;
      const total = spaceMode ? Number(row.space_total || 0) : Number(row.units || 0);
      const occupied = spaceMode ? Number(row.space_occupied || 0) : Number(row.occupied_units || 0);
      const pct = total ? Math.round(occupied / total * 100) : 0;
      return <article className={`property-card module-property-card module-${module.id}`} key={row.id}>
        <div className="property-cover"><span>{row.name.slice(0, 2).toUpperCase()}</span><Badge tone={row.status}>{row.status}</Badge></div>
        <div className="property-body">
          <div className="property-card-heading"><div><ModuleBadge moduleId={module.id}/><h2>{row.name}</h2></div><span className="property-currency">{row.currency}</span></div>
          <p className="property-address">{row.address}{row.city ? `, ${row.city}` : ""}{row.country ? ` · ${row.country}` : ""}</p>
          <div className="property-model-copy"><span>{module.family}</span><small>{module.terminology.occupant} · {module.terminology.unit} · {module.terminology.agreement}</small></div>
          <div className="property-card-facts"><span><small>Inventory</small><strong>{total} {spaceMode ? "spaces" : "units"}</strong></span><span><small>Occupied</small><strong>{occupied}</strong></span><span><small>Contracted</small><strong>{money(row.monthly_value, row.currency)}/mo</strong></span></div>
          <div className="occupancy-line"><span>Occupancy</span><strong>{pct}%</strong></div><div className="progress" aria-label={`${pct}% occupied`}><i style={{ width: `${pct}%` }}/></div>
          {canEdit && <div className="record-actions"><OpenModalButton target={`property-edit-${row.id}`} icon="edit" className="text-button">Edit property</OpenModalButton></div>}
        </div>
      </article>;
    })}</div> : rows.length ? <Empty icon="property" title="No properties match these filters" text="Adjust the search, status, or operating model filters to view more properties."/> : <Empty title="No properties yet" text="Create the first property and choose the operating model that controls its inventory, services, workflows, and portal."/>}

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
