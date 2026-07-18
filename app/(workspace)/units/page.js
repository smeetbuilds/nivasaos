import { createUnitAction, updateUnitAction } from "@/app/actions";
import { requireUser, propertyScopeSql } from "@/lib/auth";
import { all } from "@/lib/db";
import { hasPermission } from "@/lib/permission-core";
import { money } from "@/lib/format";
import { moduleById, supportsCapability } from "@/lib/modules/catalog";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import ModuleBadge from "@/components/ModuleBadge";

export const metadata = { title: "Units & rooms" };

export default async function UnitsPage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const properties = all(`SELECT p.* FROM properties p WHERE ${scope.clause} AND p.status='active' ORDER BY p.name`, scope.params);
  const editableProperties = properties.filter((property) => hasPermission(user, "inventory.manage", property.id));
  const rows = all(
    `SELECT u.*,p.name property_name,p.currency,p.module_id,
      EXISTS(SELECT 1 FROM leases l WHERE l.unit_id=u.id AND l.status='active') active_lease,
      (SELECT COUNT(*) FROM rentable_spaces rs WHERE rs.unit_id=u.id AND rs.status!='inactive') configured_spaces,
      (SELECT COUNT(*) FROM rentable_spaces rs WHERE rs.unit_id=u.id AND rs.status='occupied') occupied_spaces
     FROM units u JOIN properties p ON p.id=u.property_id
     WHERE ${scope.clause} ORDER BY p.name,u.name`,
    scope.params
  );
  const query = await searchParams;
  const anyEditable = rows.some((row) => hasPermission(user, "inventory.manage", row.property_id));

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Module inventory" title="Units, rooms & premises" description="Define the room, apartment, quarter, dorm, or commercial premises layer. Shared modules add bed or space inventory beneath these records." actions={editableProperties.length ? <OpenModalButton target="unit-modal">Add inventory unit</OpenModalButton> : null}/>
    {rows.length ? <div className="panel"><div className="table-wrap"><table><thead><tr><th>Inventory</th><th>Operating model</th><th>Type / capacity</th><th>Space inventory</th><th>Rate</th><th>Deposit</th><th>Status</th>{anyEditable && <th>Actions</th>}</tr></thead><tbody>{rows.map((row) => {const module=moduleById(row.module_id);const usesSpaces=supportsCapability(module.id,"spaceInventory");const editable=hasPermission(user,"inventory.manage",row.property_id);return <tr key={row.id}><td><strong>{row.name}</strong><small>{row.floor ? `Floor ${row.floor}` : row.property_name}</small></td><td><ModuleBadge moduleId={module.id} compact/><small>{row.property_name}</small></td><td>{row.unit_type}<small>Capacity {row.capacity}</small></td><td>{usesSpaces ? <><strong>{row.occupied_spaces}/{row.configured_spaces}</strong><small>{Number(row.configured_spaces)<Number(row.capacity)?`${Number(row.capacity)-Number(row.configured_spaces)} spaces not configured`:"Capacity represented"}</small></> : <span className="quiet-copy">Unit-level occupancy</span>}</td><td>{money(row.monthly_rate, row.currency)}<small>catalogue default</small></td><td>{money(row.deposit, row.currency)}</td><td><Badge tone={row.status}>{row.status}</Badge></td>{anyEditable && <td>{editable ? <OpenModalButton target={`unit-edit-${row.id}`} icon="edit" className="text-button">Edit</OpenModalButton> : <span className="muted">View only</span>}</td>}</tr>})}</tbody></table></div></div> : <Empty icon="unit" title="No inventory configured" text="Add rooms, apartments, quarters, dorms, houses, shops, offices, or other module-specific premises."/>}

    {editableProperties.length > 0 && <form action={createUnitAction}><ModalForm id="unit-modal" title="Add inventory" description="The label and downstream workflows adapt to the selected property's operating module." submitLabel="Create inventory" pendingLabel="Creating…"><div className="modal-body"><label><span>Property</span><select name="propertyId" required>{editableProperties.map((property) => <option value={property.id} key={property.id}>{moduleById(property.module_id).shortLabel} · {property.name}</option>)}</select></label><div className="field-grid two"><label><span>Name / number</span><input name="name" required placeholder="Room 101 / Suite 01"/></label><label><span>Inventory type</span><input name="unitType" placeholder="Private room, Dormitory, Apartment, Office"/></label></div><div className="field-grid three"><label><span>Floor / zone</span><input name="floor"/></label><label><span>Capacity</span><input type="number" min="1" name="capacity" defaultValue="1"/></label><label><span>Status</span><select name="status"><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></select></label></div><div className="field-grid two"><label><span>Monthly catalogue rate</span><input type="number" min="0" step="0.01" name="monthlyRate" defaultValue="0" required/></label><label><span>Deposit default</span><input type="number" min="0" step="0.01" name="deposit" defaultValue="0"/></label></div><label><span>Notes</span><textarea name="notes" rows="3"/></label></div></ModalForm></form>}

    {rows.filter((row) => hasPermission(user,"inventory.manage",row.property_id)).map((row) => <form action={updateUnitAction} key={`edit-${row.id}`}><ModalForm id={`unit-edit-${row.id}`} title={`Edit ${row.name}`} description="Existing agreement rent remains unchanged. Capacity cannot fall below configured or actively allocated spaces." submitLabel="Save inventory" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="unitId" value={row.id}/><div className="summary-box"><span>Property & model</span><strong>{row.property_name} · {moduleById(row.module_id).label}</strong><small>Inventory cannot move between properties because that would break lease and financial history.</small></div><div className="field-grid two"><label><span>Name / number</span><input name="name" defaultValue={row.name} required/></label><label><span>Inventory type</span><input name="unitType" defaultValue={row.unit_type}/></label></div><div className="field-grid three"><label><span>Floor / zone</span><input name="floor" defaultValue={row.floor || ""}/></label><label><span>Capacity</span><input type="number" min="1" name="capacity" defaultValue={row.capacity}/></label><label><span>Status</span><select name="status" defaultValue={row.status}>{row.active_lease ? <option value="occupied">Occupied</option> : <><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></>}</select>{row.active_lease && <small>Controlled by active agreements.</small>}</label></div><div className="field-grid two"><label><span>Monthly catalogue rate</span><input type="number" min="0" step="0.01" name="monthlyRate" defaultValue={row.monthly_rate} required/></label><label><span>Deposit default</span><input type="number" min="0" step="0.01" name="deposit" defaultValue={row.deposit}/></label></div><label><span>Notes</span><textarea name="notes" rows="3" defaultValue={row.notes || ""}/></label></div></ModalForm></form>)}
  </>;
}
