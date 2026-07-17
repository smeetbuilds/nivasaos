import { createModuleRequestAction, reviewModuleRequestAction, savePropertyOperatingConfigAction, saveResidentVerticalProfileAction } from "@/app/actions";
import { propertyScopeSql, requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { dateTimeLabel } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { moduleById } from "@/lib/modules/catalog";
import { requestLabel, verticalContract } from "@/lib/verticals";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import ModuleBadge from "@/components/ModuleBadge";
import Icon from "@/components/Icon";

export const metadata = { title: "Module operations" };

const labels = {
  external_id: "External / member ID", organisation: "Institution / employer / organisation", department: "Department / cost centre",
  programme: "Programme / course", level_or_designation: "Academic level / designation", guardian_name: "Guardian name",
  guardian_phone: "Guardian phone", guardian_email: "Guardian email", sponsor_name: "Sponsor / responsible party",
  sponsor_reference: "Sponsor reference", payroll_recovery: "Payroll recovery per cycle", employer_paid_amount: "Employer-paid amount",
  curfew_time: "Curfew time", eligibility_end_date: "Eligibility end date",
  notice_period_days: "Notice period days", renewal_lead_days: "Renewal lead days", utility_recovery: "Utility recovery model",
  annual_escalation_percent: "Annual escalation %", lock_in_days: "Lock-in days", visitor_hours: "Visitor hours",
  meal_cutoff_time: "Meal cutoff time", electricity_billing_model: "Electricity billing model", housekeeping_frequency: "Housekeeping frequency",
  check_in_time: "Default check-in time", check_out_time: "Default check-out time", minimum_age: "Minimum guest age",
  identity_required: "Identity requirement", housekeeping_turnover_minutes: "Turnover target minutes", late_checkout_fee: "Late checkout fee",
  academic_year: "Academic year", term_start: "Term start", term_end: "Term end", guardian_required: "Guardian required",
  leave_approval_required: "Leave approval required", employer_name: "Employer name", hr_contact: "HR contact",
  payroll_recovery_enabled: "Payroll recovery enabled", eligibility_review_days: "Eligibility review lead days",
  termination_checkout_days: "Termination checkout days", tax_model: "Tax model", cam_billing_day: "CAM billing day",
  escalation_notice_days: "Escalation notice days", fitout_approval_required: "Fit-out approval required", compliance_review_days: "Compliance review days"
};

function inputType(field) {
  if (field.includes("date") || ["term_start", "term_end", "eligibility_end_date"].includes(field)) return "date";
  if (field.includes("time")) return "time";
  if (field.includes("days") || field.includes("percent") || field.includes("fee") || ["payroll_recovery", "employer_paid_amount", "minimum_age", "cam_billing_day"].includes(field)) return "number";
  if (field.includes("email")) return "email";
  return "text";
}

function parseSettings(value) {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

function ConfigFields({ contract, settings }) {
  return <div className="field-grid two">{contract.config.map((field) => <label key={field}><span>{labels[field] || requestLabel(field)}</span><input name={`config_${field}`} type={inputType(field)} defaultValue={settings[field] ?? ""} step={inputType(field) === "number" ? "0.01" : undefined}/></label>)}</div>;
}

function ProfileFields({ contract, profile }) {
  return <div className="field-grid two">{contract.profileFields.map((field) => <label key={field}><span>{labels[field] || requestLabel(field)}</span><input name={field} type={inputType(field)} defaultValue={profile?.[field] ?? ""} step={inputType(field) === "number" ? "0.01" : undefined}/></label>)}</div>;
}

export default async function OperationsPage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const query = await searchParams;
  const properties = all(
    `SELECT p.*,poc.settings_json,
      (SELECT COUNT(*) FROM tenants t WHERE t.property_id=p.id AND t.status='active') active_people,
      (SELECT COUNT(*) FROM module_requests mr WHERE mr.property_id=p.id AND mr.status='submitted') pending_requests
     FROM properties p LEFT JOIN property_operating_configs poc ON poc.property_id=p.id
     WHERE ${scope.clause} ORDER BY p.name`, scope.params
  );
  const propertyIds = properties.map((property) => Number(property.id));
  const people = propertyIds.length ? all(
    `SELECT t.*,p.name property_name,p.module_id,l.id lease_id,l.reference lease_reference,u.name unit_name,
      rvp.external_id,rvp.organisation,rvp.department,rvp.programme,rvp.level_or_designation,rvp.guardian_name,rvp.guardian_phone,
      rvp.guardian_email,rvp.sponsor_name,rvp.sponsor_reference,rvp.payroll_recovery,rvp.employer_paid_amount,rvp.curfew_time,rvp.eligibility_end_date
     FROM tenants t JOIN properties p ON p.id=t.property_id
     LEFT JOIN lease_tenants lt ON lt.tenant_id=t.id LEFT JOIN leases l ON l.id=lt.lease_id AND l.status='active' LEFT JOIN units u ON u.id=l.unit_id
     LEFT JOIN resident_vertical_profiles rvp ON rvp.tenant_id=t.id
     WHERE t.property_id IN (${propertyIds.map(() => "?").join(",")}) GROUP BY t.id ORDER BY p.name,t.full_name`, propertyIds
  ) : [];
  const requests = propertyIds.length ? all(
    `SELECT mr.*,p.name property_name,p.module_id,t.full_name tenant_name,l.reference lease_reference,reviewer.name reviewer_name
     FROM module_requests mr JOIN properties p ON p.id=mr.property_id JOIN tenants t ON t.id=mr.tenant_id
     LEFT JOIN leases l ON l.id=mr.lease_id LEFT JOIN users reviewer ON reviewer.id=mr.reviewed_by
     WHERE mr.property_id IN (${propertyIds.map(() => "?").join(",")})
     ORDER BY CASE mr.status WHEN 'submitted' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,mr.created_at DESC LIMIT 300`, propertyIds
  ) : [];
  const canConfigure = properties.some((property) => hasPermission(user, "verticals.manage", property.id));
  const canReview = properties.some((property) => hasPermission(user, "requests.review", property.id));

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Vertical operating system" title="Module operations" description="Configure each property’s operating rules, maintain domain-specific resident or business profiles, and review real workflow requests from every module portal."/>

    <section className="metric-grid module-metric-grid">
      <article className="metric-card"><span>Operating properties</span><strong>{properties.length}</strong><small>Each keeps an independent module contract</small></article>
      <article className="metric-card"><span>Active people</span><strong>{properties.reduce((sum, property) => sum + Number(property.active_people || 0), 0)}</strong><small>Residents, students, employees, guests and business tenants</small></article>
      <article className={`metric-card${requests.filter((item) => item.status === "submitted").length ? " risk" : ""}`}><span>Requests awaiting review</span><strong>{requests.filter((item) => item.status === "submitted").length}</strong><small>Portal and staff-created workflow requests</small></article>
      <article className="metric-card"><span>Configured verticals</span><strong>{properties.filter((property) => property.settings_json).length}</strong><small>Properties with operating policies saved</small></article>
    </section>

    <section className="vertical-property-grid">{properties.map((property) => { const module = moduleById(property.module_id); const contract = verticalContract(module.id); const settings = parseSettings(property.settings_json); const editable = hasPermission(user, "verticals.manage", property.id); return <article className={`vertical-property-card module-${module.id}`} key={property.id}>
      <div className="vertical-card-head"><ModuleBadge moduleId={module.id}/><Badge tone={property.status}>{property.status}</Badge></div>
      <h2>{property.name}</h2><p>{contract.label}</p>
      <div className="vertical-card-metrics"><span><strong>{property.active_people}</strong><small>{module.terminology.occupant}s</small></span><span><strong>{property.pending_requests}</strong><small>Pending requests</small></span><span><strong>{contract.config.length}</strong><small>Operating controls</small></span></div>
      <div className="vertical-card-actions">{editable && <OpenModalButton target={`config-${property.id}`} icon="settings" className="button secondary">Configure</OpenModalButton>}<a href={`#people-${property.id}`} className="text-link">Profiles</a></div>
      {editable && <form action={savePropertyOperatingConfigAction}><ModalForm id={`config-${property.id}`} title={`${property.name} · operating configuration`} description={`Configure ${contract.label.toLowerCase()} without changing shared finance, audit, or security records.`} submitLabel="Save operating rules" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="propertyId" value={property.id}/><div className="summary-box"><span>Operating model</span><strong>{module.label}</strong><small>{module.description}</small></div><ConfigFields contract={contract} settings={settings}/></div></ModalForm></form>}
    </article>; })}</section>

    <section className="panel module-section"><div className="panel-head"><div><span className="eyebrow">Domain identity</span><h2>People and vertical profiles</h2></div><span className="muted">{people.length} records</span></div>{people.length ? <div className="table-wrap"><table><thead><tr><th>Person</th><th>Module / property</th><th>Agreement</th><th>Domain identity</th><th>Responsible party</th><th></th></tr></thead><tbody>{people.map((person) => { const module = moduleById(person.module_id); const contract = verticalContract(module.id); const editable = hasPermission(user, "people.manage", person.property_id); return <tr id={`people-${person.property_id}`} key={person.id}><td><div className="person-cell"><span className="avatar">{person.full_name[0]}</span><span><strong>{person.full_name}</strong><small>{person.email || person.phone}</small></span></div></td><td><ModuleBadge moduleId={module.id} compact/><small>{person.property_name}</small></td><td>{person.lease_reference || "No active agreement"}<small>{person.unit_name || ""}</small></td><td>{person.external_id || person.programme || person.department || person.organisation || "Profile not completed"}<small>{person.level_or_designation || contract.profileTitle}</small></td><td>{person.guardian_name || person.sponsor_name || person.organisation || "—"}<small>{person.guardian_phone || person.sponsor_reference || ""}</small></td><td>{editable && <OpenModalButton target={`profile-${person.id}`} icon="edit" className="text-button">Profile</OpenModalButton>}</td></tr>; })}</tbody></table></div> : <Empty icon="tenant" title="No people available" text="Add people to a property before completing its module-specific profile."/>}</section>

    {people.filter((person) => hasPermission(user, "people.manage", person.property_id)).map((person) => { const contract = verticalContract(person.module_id); return <form action={saveResidentVerticalProfileAction} key={`profile-form-${person.id}`}><ModalForm id={`profile-${person.id}`} title={`${person.full_name} · ${contract.profileTitle}`} description={`${person.property_name} · only fields relevant to ${contract.label.toLowerCase()} are stored.`} submitLabel="Save profile" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="tenantId" value={person.id}/><ProfileFields contract={contract} profile={person}/></div></ModalForm></form>; })}

    <section className="panel module-section"><div className="panel-head"><div><span className="eyebrow">Approvals and resident workflows</span><h2>Module requests</h2></div>{canConfigure && people.length > 0 && <OpenModalButton target="request-create" icon="plus" className="button secondary">Create request</OpenModalButton>}</div>{requests.length ? <div className="table-wrap"><table><thead><tr><th>Request</th><th>Person / property</th><th>Window</th><th>Status</th><th>Resolution</th><th>Actions</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td><strong>{request.title}</strong><small>{requestLabel(request.request_type)} · {dateTimeLabel(request.created_at)}</small></td><td>{request.tenant_name}<small>{request.property_name} · {request.lease_reference || "No agreement"}</small></td><td>{request.starts_at ? dateTimeLabel(request.starts_at) : "Not specified"}<small>{request.ends_at ? `to ${dateTimeLabel(request.ends_at)}` : ""}</small></td><td><Badge tone={request.status}>{request.status}</Badge></td><td>{request.resolution_note || "—"}<small>{request.reviewer_name || ""}</small></td><td>{canReview && ["submitted", "approved"].includes(request.status) && <OpenModalButton target={`request-review-${request.id}`} className="text-button">Review</OpenModalButton>}</td></tr>)}</tbody></table></div> : <Empty icon="portal" title="No module requests" text="Residents can submit module-relevant requests from their portal, or staff can create one on their behalf."/>}</section>

    {canConfigure && people.length > 0 && <form action={createModuleRequestAction}><ModalForm id="request-create" title="Create module request" description="The server validates that the request type belongs to the selected person’s property module." submitLabel="Create request"><div className="modal-body"><label><span>Property</span><select name="propertyId" required>{properties.filter((property) => hasPermission(user, "verticals.manage", property.id)).map((property) => <option value={property.id} key={property.id}>{property.name} · {moduleById(property.module_id).shortLabel}</option>)}</select></label><label><span>Person</span><select name="tenantId" required>{people.map((person) => <option value={person.id} key={person.id}>{person.property_name} · {person.full_name}</option>)}</select></label><label><span>Active agreement (optional)</span><select name="leaseId"><option value="">No agreement</option>{people.filter((person) => person.lease_id).map((person) => <option value={person.lease_id} key={`${person.id}-${person.lease_id}`}>{person.full_name} · {person.lease_reference}</option>)}</select></label><label><span>Request type</span><select name="requestType" required>{properties.flatMap((property) => verticalContract(property.module_id).requestTypes.map((type) => <option value={type} key={`${property.module_id}-${type}`}>{moduleById(property.module_id).shortLabel} · {requestLabel(type)}</option>))}</select></label><label><span>Title</span><input name="title" required/></label><label><span>Details</span><textarea name="details" rows="4"/></label><div className="field-grid two"><label><span>Starts</span><input type="datetime-local" name="startsAt"/></label><label><span>Ends</span><input type="datetime-local" name="endsAt"/></label></div></div></ModalForm></form>}

    {requests.filter((request) => canReview && ["submitted", "approved"].includes(request.status)).map((request) => <form action={reviewModuleRequestAction} key={`review-${request.id}`}><ModalForm id={`request-review-${request.id}`} title={`Review · ${request.title}`} description={`${request.tenant_name} · ${request.property_name} · ${requestLabel(request.request_type)}`} submitLabel="Save decision"><div className="modal-body"><input type="hidden" name="requestId" value={request.id}/><div className="summary-box"><span>Resident details</span><strong>{request.details || "No additional details"}</strong><small>{request.starts_at ? `${dateTimeLabel(request.starts_at)}${request.ends_at ? ` to ${dateTimeLabel(request.ends_at)}` : ""}` : "No requested window"}</small></div><label><span>Decision</span><select name="status" defaultValue={request.status === "approved" ? "completed" : "approved"}>{request.status === "submitted" && <><option value="approved">Approve</option><option value="rejected">Reject</option></>}<option value="completed">Complete</option><option value="cancelled">Cancel</option></select></label><label><span>Resolution note</span><textarea name="resolutionNote" rows="4" required/></label></div></ModalForm></form>)}
  </>;
}
