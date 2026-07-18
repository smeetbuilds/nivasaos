import Link from "next/link";
import { createTenantAction, updateTenantAction } from "@/app/actions";
import { all } from "@/lib/db";
import { permissionScopeSql, requirePortfolioPermission } from "@/lib/permissions";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import Icon from "@/components/Icon";

export const metadata = { title: "People" };

export default async function TenantsPage({ searchParams }) {
  const user = await requirePortfolioPermission("people.manage");
  const scope = permissionScopeSql(user, "people.manage", "p");
  const properties = all(`SELECT p.* FROM properties p WHERE ${scope.clause} ORDER BY p.name`, scope.params);
  const rows = all(
    `SELECT t.*,p.name property_name,GROUP_CONCAT(u.name, ', ') units,
      EXISTS(SELECT 1 FROM lease_tenants alt JOIN leases al ON al.id=alt.lease_id WHERE alt.tenant_id=t.id AND al.status='active') active_lease,
      ta.status portal_status,ta.last_login_at
     FROM tenants t JOIN properties p ON p.id=t.property_id
     LEFT JOIN tenant_accounts ta ON ta.tenant_id=t.id
     LEFT JOIN lease_tenants lt ON lt.tenant_id=t.id
     LEFT JOIN leases l ON l.id=lt.lease_id AND l.status='active'
     LEFT JOIN units u ON u.id=l.unit_id
     WHERE ${scope.clause} GROUP BY t.id ORDER BY t.full_name`,
    scope.params
  );
  const query = await searchParams;
  const filters = {
    q: String(query?.q || "").trim().toLowerCase(),
    status: String(query?.status || ""),
    portal: String(query?.portal || ""),
    property: String(query?.property || "")
  };
  const filteredRows = rows.filter((row) => {
    const haystack = `${row.full_name} ${row.phone || ""} ${row.email || ""} ${row.identity_number || ""} ${row.property_name} ${row.units || ""}`.toLowerCase();
    const portalState = row.portal_status || "inactive";
    return (!filters.q || haystack.includes(filters.q)) && (!filters.status || row.status === filters.status) && (!filters.portal || portalState === filters.portal) && (!filters.property || String(row.property_id) === filters.property);
  });
  const activePeople = rows.filter((row) => row.status === "active").length;
  const prospects = rows.filter((row) => row.status === "prospect").length;
  const portalEnabled = rows.filter((row) => Boolean(row.portal_status)).length;
  const housedPeople = rows.filter((row) => Boolean(row.active_lease)).length;

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Resident operations" title="People" description="Maintain resident and occupant profiles, assignment context, emergency details, and secure self-service access within your people-management scope." actions={<><Link href="/tenant-portal" className="button secondary"><Icon name="portal" size={17}/>Portal access</Link><OpenModalButton target="tenant-modal" icon="plus">Add person</OpenModalButton></>}/>

    <section className="metric-grid portfolio-summary-grid" aria-label="People directory summary">
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="tenant"/></div><span>Total people</span><strong>{rows.length}</strong><small>Across properties you can manage</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="lease"/></div><span>Currently housed</span><strong>{housedPeople}</strong><small>Linked to an active agreement</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="portal"/></div><span>Portal enabled</span><strong>{portalEnabled}</strong><small>{rows.length ? Math.round(portalEnabled / rows.length * 100) : 0}% of directory</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="report"/></div><span>Pipeline</span><strong>{prospects}</strong><small>{activePeople} active · {rows.length - activePeople - prospects} former</small></article>
    </section>

    {rows.length > 0 && <form className="panel portfolio-toolbar" method="get" aria-label="Filter people">
      <div className="portfolio-toolbar-copy"><span className="eyebrow">Directory</span><strong>People records</strong><small>{filteredRows.length} of {rows.length} people shown</small></div>
      <div className="portfolio-filter-grid people-filter-grid">
        <label className="portfolio-search-field"><span>Search</span><input type="search" name="q" defaultValue={query?.q || ""} placeholder="Name, phone, email, ID, or unit"/></label>
        <label><span>Property</span><select name="property" defaultValue={filters.property}><option value="">All properties</option>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label>
        <label><span>Status</span><select name="status" defaultValue={filters.status}><option value="">All statuses</option><option value="active">Active</option><option value="prospect">Prospect</option><option value="former">Former</option></select></label>
        <label><span>Portal</span><select name="portal" defaultValue={filters.portal}><option value="">Any portal state</option><option value="active">Active</option><option value="invited">Invited</option><option value="disabled">Disabled</option><option value="inactive">Not enabled</option></select></label>
        <div className="portfolio-filter-actions"><button className="button secondary" type="submit">Apply</button><Link href="/tenants" className="text-link">Reset</Link></div>
      </div>
    </form>}

    {filteredRows.length ? <div className="panel directory-panel"><div className="table-wrap"><table className="portfolio-table people-table"><thead><tr><th>Person</th><th>Property / unit</th><th>Contact</th><th>Emergency</th><th>Portal</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.id}>
      <td><div className="person-cell"><span className="avatar">{row.full_name[0]}</span><span><strong>{row.full_name}</strong><small>{row.identity_number || "No ID recorded"}</small></span></div></td>
      <td><strong>{row.property_name}</strong><small>{row.units || "Not assigned to an active unit"}</small></td>
      <td><strong>{row.phone}</strong><small>{row.email || "No email address"}</small></td>
      <td>{row.emergency_contact || <span className="muted">Not recorded</span>}</td>
      <td><Badge tone={row.portal_status || "inactive"}>{row.portal_status || "Not enabled"}</Badge><small>{row.last_login_at ? "Has signed in" : row.portal_status ? "No sign-in yet" : "Portal invitation unavailable"}</small></td>
      <td><Badge tone={row.status}>{row.status}</Badge></td>
      <td><div className="table-actions"><OpenModalButton target={`tenant-edit-${row.id}`} icon="edit" className="text-button">Edit</OpenModalButton><Link href={`/tenant-portal?tenant=${row.id}`} className="text-link">Portal</Link></div></td>
    </tr>)}</tbody></table></div></div> : rows.length ? <Empty icon="tenant" title="No people match these filters" text="Adjust the search, property, status, or portal filters to view more records."/> : <Empty icon="tenant" title="No people yet" text="Add a resident or occupant profile, then connect them to an agreement and portal account."/>}

    <form action={createTenantAction}><ModalForm id="tenant-modal" title="Add a person" description="Create the profile first. Agreement assignment and portal access remain separate controlled workflows." submitLabel="Add person" pendingLabel="Adding…"><div className="modal-body"><label><span>Property</span><select name="propertyId" required>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label><div className="field-grid two"><label><span>Full name</span><input name="fullName" required/></label><label><span>Phone with country code</span><input name="phone" required placeholder="919876543210"/></label></div><div className="field-grid two"><label><span>Email</span><input type="email" name="email"/><small>Required before portal access can be issued.</small></label><label><span>Identity number</span><input name="identityNumber"/></label></div><label><span>Emergency contact</span><input name="emergencyContact" placeholder="Name · phone"/></label><label><span>Permanent address</span><textarea name="address" rows="3"/></label><label><span>Status</span><select name="status"><option value="active">Active</option><option value="prospect">Prospect</option><option value="former">Former</option></select></label></div></ModalForm></form>

    {rows.map((row) => <form action={updateTenantAction} key={`edit-${row.id}`}><ModalForm id={`tenant-edit-${row.id}`} title={`Edit ${row.full_name}`} description="Contact and identity updates preserve agreement, payment, deposit, and portal history." submitLabel="Save person" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="tenantId" value={row.id}/><div className="summary-box"><span>Property</span><strong>{row.property_name}</strong><small>Property scope cannot change while historical records refer to this profile.</small></div><div className="field-grid two"><label><span>Full name</span><input name="fullName" defaultValue={row.full_name} required/></label><label><span>Phone with country code</span><input name="phone" defaultValue={row.phone} required/></label></div><div className="field-grid two"><label><span>Email</span><input type="email" name="email" defaultValue={row.email || ""}/><small>{row.portal_status ? "Changing this email revokes portal sessions." : "Required to enable the portal."}</small></label><label><span>Identity number</span><input name="identityNumber" defaultValue={row.identity_number || ""}/></label></div><label><span>Emergency contact</span><input name="emergencyContact" defaultValue={row.emergency_contact || ""}/></label><label><span>Permanent address</span><textarea name="address" rows="3" defaultValue={row.address || ""}/></label><label><span>Status</span><select name="status" defaultValue={row.status}>{row.active_lease ? <option value="active">Active</option> : <><option value="active">Active</option><option value="prospect">Prospect</option><option value="former">Former</option></>}</select>{row.active_lease && <small>Controlled by an active agreement.</small>}</label></div></ModalForm></form>)}
  </>;
}
