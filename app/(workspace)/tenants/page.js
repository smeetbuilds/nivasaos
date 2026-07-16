import Link from "next/link";
import { createTenantAction, updateTenantAction } from "@/app/actions";
import { requireUser, propertyScopeSql } from "@/lib/auth";
import { all } from "@/lib/db";
import { accessibleProperties } from "@/lib/data";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import Icon from "@/components/Icon";

export const metadata = { title: "Tenants" };

export default async function TenantsPage({ searchParams }) {
  const user = await requireUser();
  const properties = accessibleProperties(user);
  const scope = propertyScopeSql(user, "p");
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

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Residents" title="Tenants" description="Maintain resident profiles, occupancy details, and secure self-service portal access." actions={<><Link href="/tenant-portal" className="button secondary"><Icon name="portal" size={17}/>Tenant portal</Link><OpenModalButton target="tenant-modal">Add tenant</OpenModalButton></>}/>
    {rows.length ? <div className="panel"><div className="table-wrap"><table><thead><tr><th>Tenant</th><th>Property / unit</th><th>Contact</th><th>Emergency</th><th>Portal</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
      <td><div className="person-cell"><span className="avatar">{row.full_name[0]}</span><span><strong>{row.full_name}</strong><small>{row.identity_number || "No ID recorded"}</small></span></div></td>
      <td>{row.property_name}<small>{row.units || "Not assigned"}</small></td>
      <td>{row.phone}<small>{row.email || "No email"}</small></td>
      <td>{row.emergency_contact || "—"}</td>
      <td><Badge tone={row.portal_status || "inactive"}>{row.portal_status || "Not enabled"}</Badge><small>{row.last_login_at ? "Has signed in" : row.portal_status ? "No sign-in yet" : ""}</small></td>
      <td><Badge tone={row.status}>{row.status}</Badge></td>
      <td><div className="table-actions"><OpenModalButton target={`tenant-edit-${row.id}`} icon="edit" className="text-button">Edit</OpenModalButton><Link href={`/tenant-portal?tenant=${row.id}`} className="text-link">Portal</Link></div></td>
    </tr>)}</tbody></table></div></div> : <Empty icon="tenant" title="No tenants yet" text="Add a tenant record, then assign one or more tenants while creating a lease."/>}

    <form action={createTenantAction}><ModalForm id="tenant-modal" title="Add a tenant" description="Create the resident profile first; lease and portal assignment happen separately." submitLabel="Add tenant" pendingLabel="Adding…"><div className="modal-body"><label><span>Property</span><select name="propertyId" required>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label><div className="field-grid two"><label><span>Full name</span><input name="fullName" required/></label><label><span>Phone with country code</span><input name="phone" required placeholder="919876543210"/></label></div><div className="field-grid two"><label><span>Email</span><input type="email" name="email"/><small>Required before portal access can be issued.</small></label><label><span>Identity number</span><input name="identityNumber"/></label></div><label><span>Emergency contact</span><input name="emergencyContact" placeholder="Name · phone"/></label><label><span>Permanent address</span><textarea name="address" rows="3"/></label><label><span>Status</span><select name="status"><option value="active">Active</option><option value="prospect">Prospect</option><option value="former">Former</option></select></label></div></ModalForm></form>

    {rows.map((row) => <form action={updateTenantAction} key={`edit-${row.id}`}>
      <ModalForm id={`tenant-edit-${row.id}`} title={`Edit ${row.full_name}`} description="Contact and identity updates preserve lease, payment, deposit, and portal history." submitLabel="Save tenant" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="tenantId" value={row.id}/><div className="summary-box"><span>Property</span><strong>{row.property_name}</strong><small>Tenant property scope cannot change while historical records refer to this profile.</small></div><div className="field-grid two"><label><span>Full name</span><input name="fullName" defaultValue={row.full_name} required/></label><label><span>Phone with country code</span><input name="phone" defaultValue={row.phone} required/></label></div><div className="field-grid two"><label><span>Email</span><input type="email" name="email" defaultValue={row.email || ""}/><small>{row.portal_status ? "Changing this email revokes portal sessions." : "Required to enable the portal."}</small></label><label><span>Identity number</span><input name="identityNumber" defaultValue={row.identity_number || ""}/></label></div><label><span>Emergency contact</span><input name="emergencyContact" defaultValue={row.emergency_contact || ""}/></label><label><span>Permanent address</span><textarea name="address" rows="3" defaultValue={row.address || ""}/></label><label><span>Status</span><select name="status" defaultValue={row.status}>{row.active_lease ? <option value="active">Active</option> : <><option value="active">Active</option><option value="prospect">Prospect</option><option value="former">Former</option></>}</select>{row.active_lease && <small>Controlled by an active lease.</small>}</label></div></ModalForm>
    </form>)}
  </>;
}
