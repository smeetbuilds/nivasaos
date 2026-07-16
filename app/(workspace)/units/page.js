import { createUnitAction } from "@/app/actions";
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
  const user=await requireUser(); const properties=accessibleProperties(user); const scope=propertyScopeSql(user,"p");
  const rows=all(`SELECT u.*,p.name property_name,p.currency FROM units u JOIN properties p ON p.id=u.property_id WHERE ${scope.clause} ORDER BY p.name,u.name`,scope.params); const query=await searchParams;
  return <><Flash searchParams={query}/><PageHeader eyebrow="Inventory" title="Units & availability" description="Track rooms, beds, apartments, capacity, rates, deposits, and live occupancy." actions={user.role!=="staff"&&<OpenModalButton target="unit-modal">Add unit</OpenModalButton>}/>
  {rows.length?<div className="panel"><div className="table-wrap"><table><thead><tr><th>Unit</th><th>Property</th><th>Type / capacity</th><th>Rate</th><th>Deposit</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.name}</strong><small>{r.floor?`Floor ${r.floor}`:"No floor set"}</small></td><td>{r.property_name}</td><td>{r.unit_type}<small>{r.capacity} occupant{r.capacity===1?"":"s"}</small></td><td>{money(r.monthly_rate,r.currency)}<small>per month</small></td><td>{money(r.deposit,r.currency)}</td><td><Badge tone={r.status}>{r.status}</Badge></td></tr>)}</tbody></table></div></div>:<Empty title="No units configured" text="Add rooms, beds, apartments, or rentable spaces under a property."/>}
  {user.role!=="staff"&&<form action={createUnitAction}><ModalForm id="unit-modal" title="Add a unit" description="A unit is any separately rentable room, bed, apartment, or house." submitLabel="Create unit"><div className="modal-body"><label><span>Property</span><select name="propertyId" required>{properties.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><div className="field-grid two"><label><span>Unit name / number</span><input name="name" required placeholder="Room 101"/></label><label><span>Unit type</span><input name="unitType" defaultValue="Private room"/></label></div><div className="field-grid three"><label><span>Floor</span><input name="floor"/></label><label><span>Capacity</span><input type="number" min="1" name="capacity" defaultValue="1"/></label><label><span>Status</span><select name="status"><option>available</option><option>maintenance</option><option>inactive</option></select></label></div><div className="field-grid two"><label><span>Monthly rate</span><input type="number" min="0" step="0.01" name="monthlyRate" required/></label><label><span>Deposit</span><input type="number" min="0" step="0.01" name="deposit"/></label></div><label><span>Notes</span><textarea name="notes" rows="3"/></label></div></ModalForm></form>}</>;
}
