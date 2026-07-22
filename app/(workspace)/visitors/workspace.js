import { createVisitorEntryAction, updateVisitorStatusAction } from "@/app/actions";
import { propertyScopeSql, requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { dateTimeLabel } from "@/lib/format";
import { supportsCapability } from "@/lib/modules/catalog";
import ActionButton from "@/components/ActionButton";
import Badge from "@/components/Badge";
import ConfirmAction from "@/components/ConfirmAction";
import Empty from "@/components/Empty";
import Flash from "@/components/Flash";
import ModalForm from "@/components/ModalForm";
import ModuleBadge from "@/components/ModuleBadge";
import OpenModalButton from "@/components/OpenModalButton";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Visitor register" };

export default async function VisitorsPage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const allProperties = all(`SELECT p.* FROM properties p WHERE ${scope.clause} AND p.status='active' ORDER BY p.name`, scope.params);
  const properties = allProperties.filter((property) => supportsCapability(property.module_id, "visitorRegister"));
  const propertyIds = properties.map((property) => Number(property.id));
  const entries = propertyIds.length ? all(
    `SELECT ve.*,p.name property_name,p.module_id,t.full_name tenant_name,l.reference lease_reference,u.name unit_name,
      creator.name staff_creator
     FROM visitor_entries ve JOIN properties p ON p.id=ve.property_id JOIN tenants t ON t.id=ve.tenant_id
     LEFT JOIN leases l ON l.id=ve.lease_id LEFT JOIN units u ON u.id=l.unit_id LEFT JOIN users creator ON creator.id=ve.created_by_user
     WHERE ve.property_id IN (${propertyIds.map(() => "?").join(",")})
     ORDER BY CASE ve.status WHEN 'checked_in' THEN 0 WHEN 'expected' THEN 1 ELSE 2 END,ve.expected_at DESC,ve.id DESC LIMIT 250`,
    propertyIds
  ) : [];
  const leases = propertyIds.length ? all(
    `SELECT l.id,l.reference,l.property_id,p.name property_name,u.name unit_name
     FROM leases l JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id
     WHERE l.property_id IN (${propertyIds.map(() => "?").join(",")}) AND l.status='active' ORDER BY p.name,u.name`,
    propertyIds
  ) : [];
  const tenants = propertyIds.length ? all(
    `SELECT t.id,t.full_name,t.property_id,p.name property_name
     FROM tenants t JOIN properties p ON p.id=t.property_id
     WHERE t.property_id IN (${propertyIds.map(() => "?").join(",")}) AND t.status='active' ORDER BY p.name,t.full_name`,
    propertyIds
  ) : [];
  const query = await searchParams;
  const expected = entries.filter((entry) => entry.status === "expected").length;
  const inside = entries.filter((entry) => entry.status === "checked_in").length;
  const completed = entries.filter((entry) => entry.status === "checked_out").length;

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Resident safety & access" title="Visitor register" description="Residents can pre-register expected visitors; authorised staff confirm physical arrival, departure, and cancelled access records." actions={properties.length ? <OpenModalButton target="visitor-create" icon="visitors">Register visitor</OpenModalButton> : null}/>

    <section className="metric-grid module-metric-grid" aria-label="Visitor access summary">
      <article className={`metric-card${inside ? " attention" : ""}`}><span>Currently inside</span><strong>{inside}</strong><small>Checked in and not yet checked out</small></article>
      <article className="metric-card"><span>Expected</span><strong>{expected}</strong><small>Pre-registered arrivals</small></article>
      <article className="metric-card"><span>Completed visits</span><strong>{completed}</strong><small>Retained as audit history</small></article>
      <article className="metric-card"><span>Compatible properties</span><strong>{properties.length}</strong><small>Visitor controls enabled by module</small></article>
    </section>

    {entries.length ? <section className="panel module-directory-section" aria-labelledby="visitor-movements-title">
      <div className="panel-head"><div><span className="eyebrow">Live access desk</span><h2 id="visitor-movements-title">Visitor movements</h2></div><OpenModalButton target="visitor-create" className="button secondary">New entry</OpenModalButton></div>
      <div className="table-wrap"><table className="module-directory-table" data-mobile-cards="visitors" aria-label="Visitor movement register">
        <thead><tr><th>Visitor</th><th>Resident / home</th><th>Expected</th><th>Movement</th><th>Purpose</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{entries.map((entry) => <tr key={entry.id}>
          <td data-label="Visitor"><strong>{entry.visitor_name}</strong><small>{entry.visitor_phone || "No phone"}{entry.relationship ? ` · ${entry.relationship}` : ""}</small></td>
          <td data-label="Resident / home"><ModuleBadge moduleId={entry.module_id} compact/><strong>{entry.tenant_name}</strong><small>{entry.property_name}{entry.unit_name ? ` · ${entry.unit_name}` : ""}{entry.lease_reference ? ` · ${entry.lease_reference}` : ""}</small></td>
          <td data-label="Expected"><strong>{dateTimeLabel(entry.expected_at)}</strong><small>{entry.expected_checkout ? `Expected out ${dateTimeLabel(entry.expected_checkout)}` : "No expected checkout"}</small></td>
          <td data-label="Movement"><strong>{entry.checked_in_at ? `In ${dateTimeLabel(entry.checked_in_at)}` : "Not checked in"}</strong><small>{entry.checked_out_at ? `Out ${dateTimeLabel(entry.checked_out_at)}` : entry.created_by_tenant ? "Resident pre-registration" : `Staff: ${entry.staff_creator || "Former user"}`}</small></td>
          <td data-label="Purpose"><strong>{entry.purpose}</strong><small>{entry.notes || entry.id_reference || "No additional note"}</small></td>
          <td data-label="Status"><Badge tone={entry.status === "checked_in" ? "active" : entry.status === "checked_out" ? "paid" : entry.status}>{entry.status.replaceAll("_", " ")}</Badge></td>
          <td data-label="Actions"><div className="table-actions module-row-actions">
            {entry.status === "expected" && <form action={updateVisitorStatusAction}><input type="hidden" name="visitorId" value={entry.id}/><input type="hidden" name="visitorAction" value="check_in"/><ActionButton className="button primary small" pendingLabel="Checking in…">Check in</ActionButton></form>}
            {entry.status === "checked_in" && <form action={updateVisitorStatusAction}><input type="hidden" name="visitorId" value={entry.id}/><input type="hidden" name="visitorAction" value="check_out"/><ActionButton className="button secondary small" pendingLabel="Checking out…">Check out</ActionButton></form>}
            {entry.status === "expected" && <ConfirmAction action={updateVisitorStatusAction} id={`visitor-cancel-${entry.id}`} triggerLabel="Cancel visit" triggerClassName="text-button danger" title={`Cancel ${entry.visitor_name}'s visit?`} description={`${entry.tenant_name} · ${entry.property_name}`} submitLabel="Cancel visit" pendingLabel="Cancelling…"><div className="modal-body"><input type="hidden" name="visitorId" value={entry.id}/><input type="hidden" name="visitorAction" value="cancel"/><div className="confirm-consequence">The expected visit remains in access history as cancelled and can no longer be checked in.</div></div></ConfirmAction>}
          </div></td>
        </tr>)}</tbody>
      </table></div>
    </section> : <Empty icon="visitors" title="No visitor activity" text={properties.length ? "Residents can pre-register through their portal, or staff can create the first visitor entry here." : "Enable a compatible accommodation module and create a property first."}/>} 

    {properties.length > 0 && <form action={createVisitorEntryAction}><ModalForm id="visitor-create" title="Register a visitor" description="Staff may record an expected arrival or confirm an immediate check-in. Every property, resident, and agreement relationship is revalidated." submitLabel="Save visitor" pendingLabel="Saving…"><div className="modal-body">
      <label><span>Property</span><select name="propertyId" required>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label>
      <div className="field-grid two"><label><span>Resident</span><select name="tenantId" required>{properties.map((property) => <optgroup label={property.name} key={property.id}>{tenants.filter((tenant) => Number(tenant.property_id) === Number(property.id)).map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.full_name}</option>)}</optgroup>)}</select></label><label><span>Active agreement (optional)</span><select name="leaseId"><option value="">Property-level visit</option>{properties.map((property) => <optgroup label={property.name} key={property.id}>{leases.filter((lease) => Number(lease.property_id) === Number(property.id)).map((lease) => <option value={lease.id} key={lease.id}>{lease.unit_name} · {lease.reference}</option>)}</optgroup>)}</select></label></div>
      <div className="field-grid two"><label><span>Visitor name</span><input name="visitorName" required maxLength="160" autoComplete="name"/></label><label><span>Visitor phone</span><input name="visitorPhone" type="tel" inputMode="tel" autoComplete="tel" maxLength="40"/></label></div>
      <div className="field-grid two"><label><span>Relationship</span><input name="relationship" maxLength="100" placeholder="Parent, friend, vendor"/></label><label><span>ID reference (optional)</span><input name="idReference" maxLength="120"/></label></div>
      <label><span>Purpose</span><input name="purpose" required maxLength="500" placeholder="Personal visit"/></label>
      <div className="field-grid two"><label><span>Expected / arrival time</span><input type="datetime-local" name="expectedAt" required/></label><label><span>Expected checkout</span><input type="datetime-local" name="expectedCheckout"/></label></div>
      <label><span>Initial status</span><select name="status"><option value="expected">Expected</option><option value="checked_in">Check in now</option></select></label>
      <label><span>Notes</span><textarea name="notes" rows="3" maxLength="1200"/></label>
      <div className="module-form-note">Choose the property, resident, and agreement from the same home. The server rejects mismatched relationships.</div>
    </div></ModalForm></form>}
  </>;
}
