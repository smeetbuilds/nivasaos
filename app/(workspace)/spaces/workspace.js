import { allocateSpaceAction, createSpaceAction, releaseSpaceAllocationAction, updateSpaceAction } from "@/app/actions";
import { propertyScopeSql, requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { dateLabel, money, today } from "@/lib/format";
import { supportsCapability } from "@/lib/modules/catalog";
import { hasPermission } from "@/lib/permissions";
import Badge from "@/components/Badge";
import ConfirmAction from "@/components/ConfirmAction";
import Empty from "@/components/Empty";
import Flash from "@/components/Flash";
import ModalForm from "@/components/ModalForm";
import ModuleBadge from "@/components/ModuleBadge";
import OpenModalButton from "@/components/OpenModalButton";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Bed & space inventory" };

export default async function SpacesPage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const allProperties = all(`SELECT p.* FROM properties p WHERE ${scope.clause} AND p.status='active' ORDER BY p.name`, scope.params);
  const properties = allProperties.filter((property) => supportsCapability(property.module_id, "spaceInventory"));
  const propertyIds = properties.map((property) => Number(property.id));
  const allocationPropertyIds = properties.filter((property) => hasPermission(user, "agreements.manage", property.id)).map((property) => Number(property.id));
  const allocationPropertySet = new Set(allocationPropertyIds);
  const units = propertyIds.length ? all(
    `SELECT u.*,p.name property_name,p.module_id,p.currency
     FROM units u JOIN properties p ON p.id=u.property_id
     WHERE u.property_id IN (${propertyIds.map(() => "?").join(",")}) AND u.status!='inactive' ORDER BY p.name,u.name`,
    propertyIds
  ) : [];
  const spaces = propertyIds.length ? all(
    `SELECT rs.*,p.name property_name,p.module_id,p.currency,u.name unit_name,u.capacity,
      sa.id allocation_id,sa.lease_id,sa.tenant_id,sa.start_date allocation_start,l.reference lease_reference,t.full_name tenant_name
     FROM rentable_spaces rs JOIN properties p ON p.id=rs.property_id JOIN units u ON u.id=rs.unit_id
     LEFT JOIN space_allocations sa ON sa.space_id=rs.id AND sa.status='active'
     LEFT JOIN leases l ON l.id=sa.lease_id LEFT JOIN tenants t ON t.id=sa.tenant_id
     WHERE rs.property_id IN (${propertyIds.map(() => "?").join(",")}) ORDER BY p.name,u.name,rs.code`,
    propertyIds
  ) : [];
  const leases = allocationPropertyIds.length ? all(
    `SELECT l.id,l.reference,l.property_id,l.unit_id,p.name property_name,u.name unit_name
     FROM leases l JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id
     WHERE l.property_id IN (${allocationPropertyIds.map(() => "?").join(",")}) AND l.status='active' ORDER BY p.name,u.name,l.reference`,
    allocationPropertyIds
  ) : [];
  const leaseTenants = leases.length ? all(
    `SELECT lt.lease_id,t.id tenant_id,t.full_name
     FROM lease_tenants lt JOIN tenants t ON t.id=lt.tenant_id
     WHERE lt.lease_id IN (${leases.map(() => "?").join(",")}) ORDER BY t.full_name`,
    leases.map((lease) => Number(lease.id))
  ) : [];
  const query = await searchParams;
  const occupied = spaces.filter((space) => space.status === "occupied").length;
  const available = spaces.filter((space) => space.status === "available").length;
  const unavailable = spaces.filter((space) => ["maintenance", "inactive"].includes(space.status)).length;
  const utilization = spaces.length ? Math.round(occupied / spaces.length * 100) : 0;
  const emptyText = properties.length
    ? "Add beds or assignable spaces beneath compatible rooms. Capacity and allocation conflicts are enforced server-side."
    : "Enable a shared-accommodation module and create a compatible property first.";

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Shared accommodation inventory" title="Beds & rentable spaces" description="Track every bed or assignable space independently, preserve allocation history, and connect active inventory to the correct resident and agreement." actions={properties.length ? <OpenModalButton target="space-create" icon="plus">Add space</OpenModalButton> : null}/>

    <section className="metric-grid module-metric-grid" aria-label="Bed and space inventory summary">
      <article className="metric-card"><span>Total tracked spaces</span><strong>{spaces.length}</strong><small>Across {properties.length} compatible properties</small></article>
      <article className="metric-card"><span>Available</span><strong>{available}</strong><small>Ready for allocation</small></article>
      <article className="metric-card"><span>Occupied</span><strong>{occupied}</strong><small>Linked to active agreements</small></article>
      <article className={`metric-card${unavailable ? " attention" : ""}`}><span>Utilisation</span><strong>{utilization}%</strong><small>{unavailable ? `${unavailable} maintenance or inactive` : "All non-occupied spaces available"}</small></article>
    </section>

    {spaces.length ? <section className="panel module-directory-section" aria-labelledby="space-register-title">
      <div className="panel-head"><div><span className="eyebrow">Live inventory</span><h2 id="space-register-title">Space register</h2></div><span className="panel-count">{spaces.length} spaces</span></div>
      <div className="table-wrap"><table className="module-directory-table" data-mobile-cards="spaces" aria-label="Bed and rentable space register">
        <thead><tr><th>Space</th><th>Property / unit</th><th>Policy</th><th>Rate / deposit</th><th>Allocation</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{spaces.map((space) => {
          const canManageAllocation = allocationPropertySet.has(Number(space.property_id));
          const unitLeases = canManageAllocation ? leases.filter((lease) => Number(lease.unit_id) === Number(space.unit_id)) : [];
          return <tr key={space.id}>
            <td data-label="Space"><strong>{space.code}</strong><small>{space.space_type.replaceAll("_", " ")}</small></td>
            <td data-label="Property / unit"><ModuleBadge moduleId={space.module_id} compact/><strong>{space.property_name}</strong><small>{space.unit_name} · capacity {space.capacity}</small></td>
            <td data-label="Policy"><strong>{space.gender_policy === "any" ? "No restriction" : space.gender_policy}</strong><small>{space.notes || "No additional rule"}</small></td>
            <td data-label="Rate / deposit"><strong>{money(space.monthly_rate, space.currency)}</strong><small>Deposit {money(space.deposit, space.currency)}</small></td>
            <td data-label="Allocation">{space.tenant_name ? <><strong>{space.tenant_name}</strong><small>{space.lease_reference} · since {dateLabel(space.allocation_start)}</small></> : <><strong>Not allocated</strong><small>{canManageAllocation ? (unitLeases.length ? `${unitLeases.length} compatible active agreement(s)` : "No active agreement in this unit") : "Agreement access required to allocate"}</small></>}</td>
            <td data-label="Status"><Badge tone={space.status}>{space.status.replaceAll("_", " ")}</Badge></td>
            <td data-label="Actions"><div className="table-actions module-row-actions">
              <OpenModalButton target={`space-edit-${space.id}`} icon="edit" className="text-button">Edit space</OpenModalButton>
              {canManageAllocation && space.status === "available" && unitLeases.length > 0 && <OpenModalButton target={`space-allocate-${space.id}`} className="button secondary small">Allocate</OpenModalButton>}
              {canManageAllocation && space.allocation_id && <ConfirmAction action={releaseSpaceAllocationAction} id={`space-release-${space.id}`} triggerLabel="Release allocation" triggerClassName="text-button danger" title={`Release ${space.code}?`} description={`${space.tenant_name} · ${space.property_name} · ${space.unit_name}`} submitLabel="Release allocation" pendingLabel="Releasing…"><div className="modal-body"><input type="hidden" name="allocationId" value={space.allocation_id}/><input type="hidden" name="endDate" value={today()}/><div className="confirm-consequence">The active allocation ends today. The agreement and historical occupancy record remain unchanged.</div></div></ConfirmAction>}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>
    </section> : <Empty icon="spaces" title="No spaces configured" text={emptyText}/>} 

    {properties.length > 0 && <form action={createSpaceAction}><ModalForm id="space-create" title="Add a rentable space" description="The active space count cannot exceed the selected unit capacity." submitLabel="Create space" pendingLabel="Creating…"><div className="modal-body">
      <label><span>Property</span><select name="propertyId" required>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label>
      <label><span>Unit / room</span><select name="unitId" required>{properties.map((property) => <optgroup label={property.name} key={property.id}>{units.filter((unit) => Number(unit.property_id) === Number(property.id)).map((unit) => <option value={unit.id} key={unit.id}>{unit.name} · capacity {unit.capacity}</option>)}</optgroup>)}</select></label>
      <div className="field-grid two"><label><span>Space code</span><input name="code" required maxLength="100" placeholder="Bed A"/></label><label><span>Space type</span><select name="spaceType"><option value="bed">Bed</option><option value="bunk">Bunk</option><option value="desk">Desk</option><option value="parking">Parking</option><option value="locker">Locker</option><option value="other">Other</option></select></label></div>
      <div className="field-grid three"><label><span>Monthly rate</span><input type="number" min="0" step="0.01" name="monthlyRate" defaultValue="0" inputMode="decimal"/></label><label><span>Deposit</span><input type="number" min="0" step="0.01" name="deposit" defaultValue="0" inputMode="decimal"/></label><label><span>Occupancy policy</span><select name="genderPolicy"><option value="any">Any</option><option value="male">Male</option><option value="female">Female</option><option value="family">Family</option><option value="custom">Custom</option></select></label></div>
      <label><span>Initial status</span><select name="status"><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></select></label>
      <label><span>Notes / custom rule</span><textarea name="notes" rows="3" maxLength="1500"/></label>
      <div className="module-form-note">Choose a unit from the selected property. Capacity and property relationships are revalidated before creation.</div>
    </div></ModalForm></form>}

    {spaces.map((space) => <form action={updateSpaceAction} key={`edit-${space.id}`}><ModalForm id={`space-edit-${space.id}`} title={`Edit ${space.code}`} description="Allocated spaces remain occupied until their allocation is released." submitLabel="Save space" pendingLabel="Saving…"><div className="modal-body">
      <input type="hidden" name="spaceId" value={space.id}/><div className="summary-box"><span>Location</span><strong>{space.property_name} · {space.unit_name}</strong><small>{space.allocation_id ? `Allocated to ${space.tenant_name}` : "Not currently allocated"}</small></div>
      <div className="field-grid two"><label><span>Space code</span><input name="code" defaultValue={space.code} required maxLength="100"/></label><label><span>Type</span><select name="spaceType" defaultValue={space.space_type}>{["bed", "bunk", "desk", "parking", "locker", "other"].map((value) => <option value={value} key={value}>{value}</option>)}</select></label></div>
      <div className="field-grid three"><label><span>Monthly rate</span><input type="number" min="0" step="0.01" name="monthlyRate" defaultValue={space.monthly_rate} inputMode="decimal"/></label><label><span>Deposit</span><input type="number" min="0" step="0.01" name="deposit" defaultValue={space.deposit} inputMode="decimal"/></label><label><span>Policy</span><select name="genderPolicy" defaultValue={space.gender_policy}>{["any", "male", "female", "family", "custom"].map((value) => <option value={value} key={value}>{value}</option>)}</select></label></div>
      <label><span>Status</span><select name="status" defaultValue={space.status}>{space.allocation_id ? <option value="occupied">Occupied</option> : <><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></>}</select></label>
      <label><span>Notes</span><textarea name="notes" rows="3" maxLength="1500" defaultValue={space.notes || ""}/></label>
    </div></ModalForm></form>)}

    {spaces.filter((space) => space.status === "available" && allocationPropertySet.has(Number(space.property_id))).map((space) => {
      const unitLeases = leases.filter((lease) => Number(lease.unit_id) === Number(space.unit_id));
      const validLeaseIds = new Set(unitLeases.map((lease) => Number(lease.id)));
      const tenants = leaseTenants.filter((tenant) => validLeaseIds.has(Number(tenant.lease_id)));
      if (!unitLeases.length) return null;
      return <form action={allocateSpaceAction} key={`allocate-${space.id}`}><ModalForm id={`space-allocate-${space.id}`} title={`Allocate ${space.code}`} description="Agreement, resident, property, and unit relationships are revalidated before allocation." submitLabel="Allocate space" pendingLabel="Allocating…"><div className="modal-body">
        <input type="hidden" name="spaceId" value={space.id}/><div className="summary-box"><span>Space</span><strong>{space.property_name} · {space.unit_name} · {space.code}</strong><small>{space.gender_policy === "any" ? "No restricted occupancy policy" : `${space.gender_policy} occupancy policy`}</small></div>
        <label><span>Active agreement</span><select name="leaseId" required>{unitLeases.map((lease) => <option value={lease.id} key={lease.id}>{lease.reference}</option>)}</select></label>
        <label><span>Linked resident</span><select name="tenantId" required>{tenants.map((tenant) => <option value={tenant.tenant_id} key={`${tenant.lease_id}-${tenant.tenant_id}`}>{tenant.full_name} · {unitLeases.find((lease) => Number(lease.id) === Number(tenant.lease_id))?.reference}</option>)}</select><small>The resident must belong to the selected agreement.</small></label>
        <label><span>Allocation date</span><input type="date" name="startDate" defaultValue={today()} required/></label>
      </div></ModalForm></form>;
    })}
  </>;
}
