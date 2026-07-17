import { createLeaseAction, endLeaseAction } from "@/app/actions";
import { all } from "@/lib/db";
import { money, dateLabel, today } from "@/lib/format";
import { permissionScopeSql, requirePortfolioPermission } from "@/lib/permissions";
import { moduleById, supportsCapability } from "@/lib/modules/catalog";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import ConfirmAction from "@/components/ConfirmAction";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import ModuleBadge from "@/components/ModuleBadge";

export const metadata = { title: "Agreements & stays" };

export default async function LeasesPage({ searchParams }) {
  const user = await requirePortfolioPermission("agreements.manage");
  const scope = permissionScopeSql(user, "agreements.manage", "p");
  const properties = all(`SELECT p.* FROM properties p WHERE ${scope.clause} AND p.status='active' ORDER BY p.name`, scope.params);
  const leases = all(
    `SELECT l.*,p.name property_name,p.currency,p.module_id,u.name unit_name,
      GROUP_CONCAT(t.full_name, ', ') tenant_names,
      (SELECT GROUP_CONCAT(rs.code, ', ') FROM space_allocations sa JOIN rentable_spaces rs ON rs.id=sa.space_id WHERE sa.lease_id=l.id AND sa.status='active') allocated_spaces,
      (SELECT COUNT(*) FROM lease_services ls WHERE ls.lease_id=l.id AND ls.status='active') active_services
     FROM leases l JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id
     LEFT JOIN lease_tenants lt ON lt.lease_id=l.id LEFT JOIN tenants t ON t.id=lt.tenant_id
     WHERE ${scope.clause} GROUP BY l.id
     ORDER BY CASE l.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,l.start_date DESC`, scope.params
  );
  const unitRows = all(
    `SELECT u.id,u.name,u.property_id,u.status,u.monthly_rate,u.deposit,u.capacity,p.name property_name,p.module_id,
      (SELECT COUNT(*) FROM rentable_spaces rs WHERE rs.unit_id=u.id AND rs.status!='inactive') configured_spaces,
      (SELECT COUNT(*) FROM rentable_spaces rs WHERE rs.unit_id=u.id AND rs.status='available') available_spaces,
      (SELECT COUNT(*) FROM leases l WHERE l.unit_id=u.id AND l.status='active') active_leases
     FROM units u JOIN properties p ON p.id=u.property_id
     WHERE ${scope.clause} AND p.status='active' AND u.status NOT IN ('maintenance','inactive') ORDER BY p.name,u.name`, scope.params
  );
  const units = unitRows.filter((unit) => supportsCapability(unit.module_id, "spaceInventory") ? Number(unit.available_spaces || 0) > 0 : unit.status === "available");
  const availableSpaces = all(`SELECT rs.id,rs.code,rs.unit_id,rs.monthly_rate,rs.deposit,rs.gender_policy,p.name property_name,p.currency,p.module_id,u.name unit_name FROM rentable_spaces rs JOIN properties p ON p.id=rs.property_id JOIN units u ON u.id=rs.unit_id WHERE ${scope.clause} AND p.status='active' AND u.status NOT IN ('maintenance','inactive') AND rs.status='available' ORDER BY p.name,u.name,rs.code`, scope.params);
  const tenants = all(`SELECT t.id,t.full_name,t.property_id,p.name property_name,p.module_id FROM tenants t JOIN properties p ON p.id=t.property_id WHERE ${scope.clause} AND p.status='active' AND t.status='active' ORDER BY p.name,t.full_name`, scope.params);
  const query = await searchParams;

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Occupancy lifecycle" title="Agreements & stays" description="Residential units remain exclusive. Shared-accommodation rooms can hold concurrent agreements only while validated bed or space inventory remains available." actions={<OpenModalButton target="lease-modal" icon="plus">Create agreement</OpenModalButton>}/>
    {leases.length ? <div className="panel"><div className="table-wrap"><table><thead><tr><th>Agreement</th><th>People</th><th>Property / inventory</th><th>Term</th><th>Rent</th><th>Module details</th><th>Status</th><th>Actions</th></tr></thead><tbody>{leases.map((lease) => { const module=moduleById(lease.module_id); return <tr key={lease.id}><td><strong>{lease.reference}</strong><small>{module.terminology.agreement} · billing day {lease.billing_day}</small></td><td>{lease.tenant_names || "No linked person"}</td><td><ModuleBadge moduleId={module.id} compact/><strong>{lease.property_name}</strong><small>{lease.unit_name}{lease.allocated_spaces ? ` · ${lease.allocated_spaces}` : ""}</small></td><td>{dateLabel(lease.start_date)}<small>{lease.end_date ? `to ${dateLabel(lease.end_date)}` : "Open ended"}</small></td><td>{money(lease.monthly_rent, lease.currency)}<small>Deposit {money(lease.deposit, lease.currency)}</small></td><td>{lease.active_services} active service{Number(lease.active_services) === 1 ? "" : "s"}<small>{module.capabilities.includes("commercialProfiles") ? "Commercial profile required" : module.capabilities.includes("spaceInventory") ? "Space-level occupancy" : "Unit-level occupancy"}</small></td><td><Badge tone={lease.status}>{lease.status}</Badge></td><td>{lease.status === "active" ? <ConfirmAction action={endLeaseAction} id={`end-lease-${lease.id}`} triggerLabel="Move out" title={`Complete move-out for ${lease.reference}?`} description="This ends the agreement, releases allocated spaces and services, and updates resident occupancy state." submitLabel="Complete move-out" pendingLabel="Completing…"><div className="modal-body"><input type="hidden" name="leaseId" value={lease.id}/><div className="summary-box"><span>Agreement</span><strong>{lease.property_name} · {lease.unit_name}</strong><small>{lease.tenant_names || "No linked person"}</small></div><div className="confirm-consequence">Move-out requires completed inspection and key-return records. The resulting occupancy changes are audited.</div></div></ConfirmAction> : <span className="muted">—</span>}</td></tr>; })}</tbody></table></div></div> : <Empty icon="lease" title="No agreements created" text="Create a residential lease, shared-accommodation stay, student housing agreement, staff occupancy, or commercial lease."/>}

    <form action={createLeaseAction}><ModalForm id="lease-modal" title="Create an agreement" description="Property, inventory, people, selected spaces, and pricing are revalidated inside one database transaction." submitLabel="Create agreement" pendingLabel="Creating…"><div className="modal-body"><label><span>Property</span><select name="propertyId" required>{properties.map((property) => <option key={property.id} value={property.id}>{moduleById(property.module_id).shortLabel} · {property.name}</option>)}</select><small>The selected inventory, people, and spaces must belong to this property.</small></label><label><span>Rentable inventory</span><select name="unitId" required>{units.map((unit) => { const module=moduleById(unit.module_id); const shared=supportsCapability(module.id,"spaceInventory"); return <option key={unit.id} value={unit.id}>{unit.property_name} · {unit.name} · {shared ? `${unit.available_spaces} of ${unit.configured_spaces} spaces free` : "unit available"}</option>; })}</select><small>Shared rooms appear while at least one configured space remains available.</small></label><label><span>People</span><select name="tenantIds" multiple required size="6">{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.property_name} · {moduleById(tenant.module_id).terminology.occupant} · {tenant.full_name}</option>)}</select><small>Select no more people than available spaces for a shared room. Use Ctrl/Cmd for multiple selection.</small></label>{availableSpaces.length > 0 && <label><span>Exact beds / spaces (optional)</span><select name="spaceIds" multiple size="6">{availableSpaces.map((space) => <option value={space.id} key={space.id}>{space.property_name} · {space.unit_name} · {space.code} · {space.gender_policy} policy · {money(space.monthly_rate, space.currency)}/mo</option>)}</select><small>For an active shared agreement, select exactly one matching space per person. Leave blank to auto-allocate unrestricted spaces.</small></label>}<div className="field-grid two"><label><span>Start date</span><input type="date" name="startDate" defaultValue={today()} required/></label><label><span>End date (optional)</span><input type="date" name="endDate"/></label></div><div className="field-grid three"><label><span>Monthly rent override (optional)</span><input type="number" min="0" step="0.01" name="monthlyRent" placeholder="Derived from selected spaces or unit"/></label><label><span>Deposit override (optional)</span><input type="number" min="0" step="0.01" name="deposit" placeholder="Derived automatically"/></label><label><span>Billing day</span><input type="number" min="1" max="28" name="billingDay" defaultValue="1"/></label></div><label><span>Status</span><select name="status"><option value="active">Active</option><option value="draft">Draft</option></select></label><label><span>Notes</span><textarea name="notes" rows="3"/></label></div></ModalForm></form>
  </>;
}
