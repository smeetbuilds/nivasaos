import { createPropertyAction, updatePropertyAction } from "@/app/actions";
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
const currencies = ["INR", "USD", "GBP", "EUR", "AED", "AUD"];

export default async function PropertiesPage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const rows = all(
    `SELECT p.*, COUNT(DISTINCT u.id) units,
      SUM(CASE WHEN u.status='occupied' THEN 1 ELSE 0 END) occupied,
      COALESCE(SUM(CASE WHEN u.status='occupied' THEN u.monthly_rate ELSE 0 END),0) monthly_value,
      (SELECT COUNT(*) FROM invoices i WHERE i.property_id=p.id) + (SELECT COUNT(*) FROM payments pay WHERE pay.property_id=p.id) financial_count
     FROM properties p LEFT JOIN units u ON u.property_id=p.id
     WHERE ${scope.clause}
     GROUP BY p.id ORDER BY p.name`,
    scope.params
  );
  const query = await searchParams;
  const canEdit = user.role !== "staff";

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Portfolio" title="Properties" description="Keep each building, boarding house, or rental portfolio independently scoped and reported." actions={canEdit && <OpenModalButton target="property-modal">Add property</OpenModalButton>}/>
    {rows.length ? <div className="property-grid">{rows.map((row) => {
      const pct = row.units ? Math.round(row.occupied / row.units * 100) : 0;
      return <article className="property-card" key={row.id}>
        <div className="property-cover"><span>{row.name.slice(0, 2).toUpperCase()}</span><Badge tone={row.status}>{row.status}</Badge></div>
        <div className="property-body">
          <span className="eyebrow">{row.type.replaceAll("_", " ")}</span><h2>{row.name}</h2><p>{row.address}{row.city ? `, ${row.city}` : ""}</p>
          <div className="occupancy-line"><span><strong>{row.occupied || 0}</strong> of {row.units || 0} units occupied</span><strong>{pct}%</strong></div><div className="progress"><i style={{ width: `${pct}%` }}/></div>
          <div className="property-foot"><span>Occupied rate value</span><strong>{money(row.monthly_value, row.currency)}/mo</strong></div>
          {canEdit && <div className="record-actions"><OpenModalButton target={`property-edit-${row.id}`} icon="edit" className="text-button">Edit property</OpenModalButton></div>}
        </div>
      </article>;
    })}</div> : <Empty title="No properties yet" text="Create your first property to begin adding units and tenants."/>}

    {canEdit && <form action={createPropertyAction}><ModalForm id="property-modal" title="Add a property" description="Create the top-level container used to scope units, people, finances, and reports." submitLabel="Create property" pendingLabel="Creating…"><div className="modal-body"><label><span>Property name</span><input name="name" required placeholder="Palm Residency"/></label><div className="field-grid two"><label><span>Type</span><select name="type"><option value="boarding_house">Boarding house</option><option value="apartment">Apartment building</option><option value="rental">Rental</option><option value="mixed">Mixed</option></select></label><label><span>Currency</span><select name="currency" defaultValue="INR">{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label></div><label><span>Street address</span><input name="address" required/></label><div className="field-grid two"><label><span>City</span><input name="city"/></label><label><span>Country</span><input name="country" defaultValue="India"/></label></div></div></ModalForm></form>}

    {canEdit && rows.map((row) => <form action={updatePropertyAction} key={`edit-${row.id}`}>
      <ModalForm id={`property-edit-${row.id}`} title={`Edit ${row.name}`} description="Changes immediately apply across the property-scoped workspace." submitLabel="Save property" pendingLabel="Saving…">
        <div className="modal-body"><input type="hidden" name="propertyId" value={row.id}/><label><span>Property name</span><input name="name" defaultValue={row.name} required/></label><div className="field-grid two"><label><span>Type</span><select name="type" defaultValue={row.type}><option value="boarding_house">Boarding house</option><option value="apartment">Apartment building</option><option value="rental">Rental</option><option value="mixed">Mixed</option></select></label><label><span>Currency</span><select name="currency" defaultValue={row.currency} disabled={Boolean(row.financial_count)}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select>{row.financial_count ? <><input type="hidden" name="currency" value={row.currency}/><small>Locked because financial records exist.</small></> : <small>Currency locks after the first invoice or payment.</small>}</label></div><label><span>Street address</span><input name="address" defaultValue={row.address} required/></label><div className="field-grid two"><label><span>City</span><input name="city" defaultValue={row.city || ""}/></label><label><span>Country</span><input name="country" defaultValue={row.country}/></label></div><label><span>Status</span><select name="status" defaultValue={row.status}><option value="active">Active</option><option value="inactive">Inactive</option></select><small>Inactive properties remain in history but should not receive new operations.</small></label></div>
      </ModalForm>
    </form>)}
  </>;
}
