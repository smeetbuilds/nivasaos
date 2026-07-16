import { createUnitAction, updateUnitAction } from "@/app/actions";
import { requireUser, propertyScopeSql } from "@/lib/auth";
import { all } from "@/lib/db";
import { money } from "@/lib/format";
import { accessibleProperties } from "@/lib/data";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";

export const metadata = { title: "Units" };

export default async function UnitsPage({ searchParams }) {
  const user = await requireUser();
  const properties = accessibleProperties(user);
  const scope = propertyScopeSql(user, "p");
  const rows = all(
    `SELECT u.*,p.name property_name,p.currency,
      EXISTS(SELECT 1 FROM leases l WHERE l.unit_id=u.id AND l.status='active') active_lease
     FROM units u JOIN properties p ON p.id=u.property_id
     WHERE ${scope.clause} ORDER BY p.name,u.name`,
    scope.params
  );
  const query = await searchParams;
  const canEdit = user.role !== "staff";

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Inventory" title="Units & availability" description="Track rooms, beds, apartments, capacity, rates, deposits, and live occupancy." actions={canEdit && <OpenModalButton target="unit-modal">Add unit</OpenModalButton>}/>
    {rows.length ? <div className="panel"><div className="table-wrap"><table><thead><tr><th>Unit</th><th>Property</th><th>Type / capacity</th><th>Rate</th><th>Deposit</th><th>Status</th>{canEdit && <th>Actions</th>}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.floor ? `Floor ${row.floor}` : "No floor set"}</small></td><td>{row.property_name}</td><td>{row.unit_type}<small>{row.capacity} occupant{row.capacity === 1 ? "" : "s"}</small></td><td>{money(row.monthly_rate, row.currency)}<small>per month</small></td><td>{money(row.deposit, row.currency)}</td><td><Badge tone={row.status}>{row.status}</Badge></td>{canEdit && <td><OpenModalButton target={`unit-edit-${row.id}`} icon="edit" className="text-button">Edit</OpenModalButton></td>}</tr>)}</tbody></table></div></div> : <Empty title="No units configured" text="Add rooms, beds, apartments, or rentable spaces under a property."/>}

    {canEdit && <form action={createUnitAction}><ModalForm id="unit-modal" title="Add a unit" description="A unit is any separately rentable room, bed, apartment, or house." submitLabel="Create unit" pendingLabel="Creating…"><div className="modal-body"><label><span>Property</span><select name="propertyId" required>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label><div className="field-grid two"><label><span>Unit name / number</span><input name="name" required placeholder="Room 101"/></label><label><span>Unit type</span><input name="unitType" defaultValue="Private room"/></label></div><div className="field-grid three"><label><span>Floor</span><input name="floor"/></label><label><span>Capacity</span><input type="number" min="1" name="capacity" defaultValue="1"/></label><label><span>Status</span><select name="status"><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></select></label></div><div className="field-grid two"><label><span>Monthly rate</span><input type="number" min="0" step="0.01" name="monthlyRate" required/></label><label><span>Deposit</span><input type="number" min="0" step="0.01" name="deposit"/></label></div><label><span>Notes</span><textarea name="notes" rows="3"/></label></div></ModalForm></form>}

    {canEdit && rows.map((row) => <form action={updateUnitAction} key={`edit-${row.id}`}>
      <ModalForm id={`unit-edit-${row.id}`} title={`Edit ${row.name}`} description="Rates update the unit catalogue; existing lease rent remains unchanged." submitLabel="Save unit" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="unitId" value={row.id}/><div className="summary-box"><span>Property</span><strong>{row.property_name}</strong><small>Move a unit between properties only by recreating it, which preserves financial and lease integrity.</small></div><div className="field-grid two"><label><span>Unit name / number</span><input name="name" defaultValue={row.name} required/></label><label><span>Unit type</span><input name="unitType" defaultValue={row.unit_type}/></label></div><div className="field-grid three"><label><span>Floor</span><input name="floor" defaultValue={row.floor || ""}/></label><label><span>Capacity</span><input type="number" min="1" name="capacity" defaultValue={row.capacity}/></label><label><span>Status</span><select name="status" defaultValue={row.status}>{row.active_lease ? <option value="occupied">Occupied</option> : <><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></>}</select>{row.active_lease && <small>Controlled by the active lease.</small>}</label></div><div className="field-grid two"><label><span>Monthly rate</span><input type="number" min="0" step="0.01" name="monthlyRate" defaultValue={row.monthly_rate} required/></label><label><span>Deposit</span><input type="number" min="0" step="0.01" name="deposit" defaultValue={row.deposit}/></label></div><label><span>Notes</span><textarea name="notes" rows="3" defaultValue={row.notes || ""}/></label></div></ModalForm>
    </form>)}
  </>;
}
