import { createPropertyAction } from "@/app/actions";
import { requireUser, propertyScopeSql } from "@/lib/auth";
import { all } from "@/lib/db";
import { money } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";

export const metadata = { title: "Properties" };

export default async function PropertiesPage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const rows = all(`SELECT p.*, COUNT(u.id) units, SUM(CASE WHEN u.status='occupied' THEN 1 ELSE 0 END) occupied, COALESCE(SUM(CASE WHEN u.status='occupied' THEN u.monthly_rate ELSE 0 END),0) monthly_value FROM properties p LEFT JOIN units u ON u.property_id=p.id WHERE ${scope.clause} GROUP BY p.id ORDER BY p.name`, scope.params);
  const query = await searchParams;
  return <><Flash searchParams={query}/><PageHeader eyebrow="Portfolio" title="Properties" description="Keep each building, boarding house, or rental portfolio independently scoped and reported." actions={user.role !== "staff" && <OpenModalButton target="property-modal">Add property</OpenModalButton>}/>
    {rows.length ? <div className="property-grid">{rows.map(row => { const pct = row.units ? Math.round(row.occupied/row.units*100) : 0; return <article className="property-card" key={row.id}><div className="property-cover"><span>{row.name.slice(0,2).toUpperCase()}</span><Badge tone={row.status}>{row.status}</Badge></div><div className="property-body"><span className="eyebrow">{row.type.replaceAll("_"," ")}</span><h2>{row.name}</h2><p>{row.address}{row.city ? `, ${row.city}` : ""}</p><div className="occupancy-line"><span><strong>{row.occupied || 0}</strong> of {row.units || 0} units occupied</span><strong>{pct}%</strong></div><div className="progress"><i style={{width:`${pct}%`}}/></div><div className="property-foot"><span>Occupied rate value</span><strong>{money(row.monthly_value,row.currency)}/mo</strong></div></div></article>})}</div> : <Empty title="No properties yet" text="Create your first property to begin adding units and tenants."/>}
    {user.role !== "staff" && <form action={createPropertyAction}><ModalForm id="property-modal" title="Add a property" description="Create the top-level container used to scope units, people, finances, and reports." submitLabel="Create property"><div className="modal-body"><label><span>Property name</span><input name="name" required placeholder="Palm Residency"/></label><div className="field-grid two"><label><span>Type</span><select name="type"><option value="boarding_house">Boarding house</option><option value="apartment">Apartment building</option><option value="rental">Rental</option><option value="mixed">Mixed</option></select></label><label><span>Currency</span><select name="currency" defaultValue="INR"><option>INR</option><option>USD</option><option>GBP</option><option>EUR</option><option>AED</option><option>AUD</option></select></label></div><label><span>Street address</span><input name="address" required/></label><div className="field-grid two"><label><span>City</span><input name="city"/></label><label><span>Country</span><input name="country" defaultValue="India"/></label></div></div></ModalForm></form>}
  </>;
}
