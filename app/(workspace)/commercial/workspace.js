import { saveCommercialProfileAction } from "@/app/actions";
import { propertyScopeSql, requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { dateLabel, money } from "@/lib/format";
import { supportsCapability } from "@/lib/modules/catalog";
import { hasPermission } from "@/lib/permissions";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import Flash from "@/components/Flash";
import ModalForm from "@/components/ModalForm";
import ModuleBadge from "@/components/ModuleBadge";
import OpenModalButton from "@/components/OpenModalButton";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Commercial leases" };

export default async function CommercialPage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const allProperties = all(`SELECT p.* FROM properties p WHERE ${scope.clause} ORDER BY p.name`, scope.params);
  const properties = allProperties.filter((property) => supportsCapability(property.module_id, "commercialProfiles") && hasPermission(user, "verticals.manage", property.id));
  const propertyIds = properties.map((property) => Number(property.id));
  const leases = propertyIds.length ? all(
    `SELECT l.*,p.name property_name,p.currency,p.module_id,u.name unit_name,clp.id profile_id,clp.tenant_id profile_tenant_id,
      clp.business_name,clp.registration_number,clp.tax_number,clp.business_activity,clp.common_area_charge,
      clp.escalation_percent,clp.escalation_date,clp.fitout_end_date,clp.notice_period_days,clp.notes,
      (SELECT GROUP_CONCAT(t.full_name, ', ') FROM lease_tenants lt JOIN tenants t ON t.id=lt.tenant_id WHERE lt.lease_id=l.id) tenant_names
     FROM leases l JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id
     LEFT JOIN commercial_lease_profiles clp ON clp.lease_id=l.id
     WHERE l.property_id IN (${propertyIds.map(() => "?").join(",")})
     ORDER BY CASE l.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,p.name,u.name,l.id DESC`,
    propertyIds
  ) : [];
  const tenants = leases.length ? all(
    `SELECT lt.lease_id,t.id,t.full_name
     FROM lease_tenants lt JOIN tenants t ON t.id=lt.tenant_id
     WHERE lt.lease_id IN (${leases.map(() => "?").join(",")}) ORDER BY t.full_name`,
    leases.map((lease) => Number(lease.id))
  ) : [];
  const query = await searchParams;
  const active = leases.filter((lease) => lease.status === "active");
  const missing = active.filter((lease) => !lease.profile_id).length;
  const upcoming = active.filter((lease) => lease.escalation_date && new Date(lease.escalation_date) <= new Date(Date.now() + 90 * 86400000) && new Date(lease.escalation_date) >= new Date()).length;
  const currencies = [...new Set(active.filter((lease) => Number(lease.common_area_charge || 0) > 0).map((lease) => lease.currency))];
  const emptyText = properties.length
    ? "Create an agreement under a commercial property, then add its business and compliance profile here."
    : "Enable Commercial Rentals and create a commercial property first.";

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Business premises" title="Commercial lease profiles" description="Keep business identity, common-area charges, fit-out dates, escalation terms, compliance references, and notice periods attached to the actual agreement."/>

    <section className="metric-grid module-metric-grid" aria-label="Commercial agreement profile summary">
      <article className="metric-card"><span>Active commercial agreements</span><strong>{active.length}</strong><small>Across {properties.length} permitted properties</small></article>
      <article className={`metric-card${missing ? " risk" : ""}`}><span>Profiles incomplete</span><strong>{missing}</strong><small>Active agreements missing business details</small></article>
      <article className={`metric-card${upcoming ? " attention" : ""}`}><span>Escalations within 90 days</span><strong>{upcoming}</strong><small>Review rent terms before the due date</small></article>
      <article className="metric-card"><span>CAM currencies</span><strong>{currencies.length}</strong><small>{currencies.length ? currencies.join(" · ") : "No CAM configured"}</small></article>
    </section>

    {leases.length ? <section className="panel module-directory-section" aria-labelledby="commercial-portfolio-title">
      <div className="panel-head"><div><span className="eyebrow">Agreement-specific business data</span><h2 id="commercial-portfolio-title">Commercial portfolio</h2></div><span className="panel-count">{leases.length} agreements</span></div>
      <div className="table-wrap"><table className="module-directory-table" data-mobile-cards="commercial-profiles" aria-label="Commercial agreement profiles">
        <thead><tr><th>Business / agreement</th><th>Premises</th><th>Registration</th><th>CAM</th><th>Escalation</th><th>Fit-out / notice</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{leases.map((lease) => <tr key={lease.id}>
          <td data-label="Business / agreement"><strong>{lease.business_name || lease.tenant_names || "Profile required"}</strong><small>{lease.reference} · {lease.business_activity || "Business activity not recorded"}</small></td>
          <td data-label="Premises"><ModuleBadge moduleId={lease.module_id} compact/><strong>{lease.property_name}</strong><small>{lease.unit_name}</small></td>
          <td data-label="Registration"><strong>{lease.registration_number || "Not recorded"}</strong><small>{lease.tax_number ? `Tax: ${lease.tax_number}` : "Tax number not recorded"}</small></td>
          <td data-label="CAM"><strong>{money(lease.common_area_charge || 0, lease.currency)}</strong><small>Per month</small></td>
          <td data-label="Escalation"><strong>{Number(lease.escalation_percent || 0)}%</strong><small>{lease.escalation_date ? dateLabel(lease.escalation_date) : "No escalation date"}</small></td>
          <td data-label="Fit-out / notice"><strong>{lease.fitout_end_date ? dateLabel(lease.fitout_end_date) : "No fit-out deadline"}</strong><small>{lease.notice_period_days ?? 30} day notice</small></td>
          <td data-label="Status"><Badge tone={lease.profile_id ? lease.status : "overdue"}>{lease.profile_id ? lease.status.replaceAll("_", " ") : "profile missing"}</Badge></td>
          <td data-label="Actions"><OpenModalButton target={`commercial-profile-${lease.id}`} icon="edit" className={lease.profile_id ? "text-button" : "button primary small"}>{lease.profile_id ? "Edit profile" : "Create profile"}</OpenModalButton></td>
        </tr>)}</tbody>
      </table></div>
    </section> : <Empty icon="commercial" title="No commercial agreements" text={emptyText}/>} 

    {leases.map((lease) => {
      const linkedTenants = tenants.filter((tenant) => Number(tenant.lease_id) === Number(lease.id));
      return <form action={saveCommercialProfileAction} key={`profile-${lease.id}`}><ModalForm id={`commercial-profile-${lease.id}`} title={`${lease.profile_id ? "Edit" : "Create"} business profile`} description={`${lease.property_name} · ${lease.unit_name} · ${lease.reference}`} submitLabel="Save commercial profile" pendingLabel="Saving…"><div className="modal-body">
        <input type="hidden" name="leaseId" value={lease.id}/>
        <div className="summary-box"><span>Agreement status</span><strong>{lease.status.replaceAll("_", " ")}</strong><small>{lease.tenant_names || "No linked business contact"}</small></div>
        <label><span>Business tenant record</span><select name="tenantId" defaultValue={lease.profile_tenant_id || ""}><option value="">Agreement-level business</option>{linkedTenants.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.full_name}</option>)}</select></label>
        <label><span>Trading / business name</span><input name="businessName" defaultValue={lease.business_name || ""} required maxLength="180" autoComplete="organization"/></label>
        <div className="field-grid two"><label><span>Registration number</span><input name="registrationNumber" defaultValue={lease.registration_number || ""} maxLength="160"/></label><label><span>Tax / GST / VAT number</span><input name="taxNumber" defaultValue={lease.tax_number || ""} maxLength="160"/></label></div>
        <label><span>Business activity</span><textarea name="businessActivity" rows="3" maxLength="1800" defaultValue={lease.business_activity || ""}/></label>
        <div className="field-grid three"><label><span>Monthly CAM</span><input type="number" min="0" step="0.01" name="commonAreaCharge" defaultValue={lease.common_area_charge || 0} inputMode="decimal"/></label><label><span>Escalation %</span><input type="number" min="0" step="0.01" name="escalationPercent" defaultValue={lease.escalation_percent || 0} inputMode="decimal"/></label><label><span>Notice period days</span><input type="number" min="0" max="730" step="1" name="noticePeriodDays" defaultValue={lease.notice_period_days ?? 30} inputMode="numeric"/></label></div>
        <div className="field-grid two"><label><span>Next escalation date</span><input type="date" name="escalationDate" defaultValue={lease.escalation_date || ""}/></label><label><span>Fit-out end date</span><input type="date" name="fitoutEndDate" defaultValue={lease.fitout_end_date || ""}/></label></div>
        <label><span>Commercial notes</span><textarea name="notes" rows="3" maxLength="2000" defaultValue={lease.notes || ""}/></label>
        <div className="module-form-note">This profile is attached to the agreement, not only to a person. Historical terms remain available after the agreement ends.</div>
      </div></ModalForm></form>;
    })}
  </>;
}
