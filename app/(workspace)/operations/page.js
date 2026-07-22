import { createModuleRequestAction, reviewModuleRequestAction, savePropertyOperatingConfigAction, saveResidentVerticalProfileAction } from "@/app/actions";
import { propertyScopeSql, requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { dateTimeLabel } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { moduleById } from "@/lib/modules/catalog";
import { requestLabel, verticalContract } from "@/lib/verticals";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import Flash from "@/components/Flash";
import ModalForm from "@/components/ModalForm";
import ModuleBadge from "@/components/ModuleBadge";
import OpenModalButton from "@/components/OpenModalButton";
import PageHeader from "@/components/PageHeader";

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
  identity_required: "Identity required", housekeeping_turnover_minutes: "Turnover target minutes", late_checkout_fee: "Late checkout fee",
  academic_year: "Academic year", term_start: "Term start", term_end: "Term end", guardian_required: "Guardian required",
  leave_approval_required: "Leave approval required", employer_name: "Employer name", hr_contact: "HR contact",
  payroll_recovery_enabled: "Payroll recovery enabled", eligibility_review_days: "Eligibility review lead days",
  termination_checkout_days: "Termination checkout days", tax_model: "Tax model", cam_billing_day: "CAM billing day",
  escalation_notice_days: "Escalation notice days", fitout_approval_required: "Fit-out approval required", compliance_review_days: "Compliance review days"
};

const booleanFields = new Set(["identity_required", "guardian_required", "leave_approval_required", "payroll_recovery_enabled", "fitout_approval_required"]);
const integerFields = new Set(["notice_period_days", "renewal_lead_days", "lock_in_days", "minimum_age", "housekeeping_turnover_minutes", "eligibility_review_days", "termination_checkout_days", "cam_billing_day", "compliance_review_days", "escalation_notice_days"]);
const moneyFields = new Set(["payroll_recovery", "employer_paid_amount", "late_checkout_fee"]);

function inputType(field) {
  if (field.includes("date") || ["term_start", "term_end", "eligibility_end_date"].includes(field)) return "date";
  if (field.includes("time")) return "time";
  if (field.includes("days") || field.includes("percent") || field.includes("fee") || moneyFields.has(field) || ["minimum_age", "cam_billing_day"].includes(field)) return "number";
  if (field.includes("email")) return "email";
  if (field.includes("phone")) return "tel";
  return "text";
}

function parseSettings(value) {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

function FieldControl({ field, name, value }) {
  if (booleanFields.has(field)) return <select name={name} defaultValue={value ?? ""}><option value="">Not configured</option><option value="yes">Yes</option><option value="no">No</option></select>;
  const type = inputType(field);
  const numeric = type === "number";
  return <input
    name={name}
    type={type}
    defaultValue={value ?? ""}
    min={numeric ? "0" : undefined}
    step={numeric ? (integerFields.has(field) ? "1" : "0.01") : undefined}
    inputMode={numeric ? (integerFields.has(field) ? "numeric" : "decimal") : type === "tel" ? "tel" : undefined}
    autoComplete={field === "guardian_email" ? "email" : field === "guardian_phone" ? "tel" : undefined}
  />;
}

function ConfigFields({ contract, settings }) {
  return <div className="field-grid two">{contract.config.map((field) => <label key={field}><span>{labels[field] || requestLabel(field)}</span><FieldControl field={field} name={`config_${field}`} value={settings[field]}/></label>)}</div>;
}

function ProfileFields({ contract, profile }) {
  return <div className="field-grid two">{contract.profileFields.map((field) => <label key={field}><span>{labels[field] || requestLabel(field)}</span><FieldControl field={field} name={field} value={profile?.[field]}/></label>)}</div>;
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
     WHERE ${scope.clause} ORDER BY p.name`,
    scope.params
  );
  const propertyIds = properties.map((property) => Number(property.id));
  const people = propertyIds.length ? all(
    `SELECT t.*,p.name property_name,p.module_id,l.id lease_id,l.reference lease_reference,u.name unit_name,
      rvp.external_id,rvp.organisation,rvp.department,rvp.programme,rvp.level_or_designation,rvp.guardian_name,
      rvp.guardian_phone,rvp.guardian_email,rvp.sponsor_name,rvp.sponsor_reference,rvp.payroll_recovery,
      rvp.employer_paid_amount,rvp.curfew_time,rvp.eligibility_end_date
     FROM tenants t JOIN properties p ON p.id=t.property_id
     LEFT JOIN lease_tenants lt ON lt.tenant_id=t.id LEFT JOIN leases l ON l.id=lt.lease_id AND l.status='active'
     LEFT JOIN units u ON u.id=l.unit_id LEFT JOIN resident_vertical_profiles rvp ON rvp.tenant_id=t.id
     WHERE t.property_id IN (${propertyIds.map(() => "?").join(",")}) GROUP BY t.id ORDER BY p.name,t.full_name`,
    propertyIds
  ) : [];
  const requests = propertyIds.length ? all(
    `SELECT mr.*,p.name property_name,p.module_id,t.full_name tenant_name,l.reference lease_reference,reviewer.name reviewer_name
     FROM module_requests mr JOIN properties p ON p.id=mr.property_id JOIN tenants t ON t.id=mr.tenant_id
     LEFT JOIN leases l ON l.id=mr.lease_id LEFT JOIN users reviewer ON reviewer.id=mr.reviewed_by
     WHERE mr.property_id IN (${propertyIds.map(() => "?").join(",")})
     ORDER BY CASE mr.status WHEN 'submitted' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,mr.created_at DESC LIMIT 300`,
    propertyIds
  ) : [];
  const configurableProperties = properties.filter((property) => hasPermission(user, "verticals.manage", property.id));
  const profilePeople = people.filter((person) => hasPermission(user, "people.manage", person.property_id));
  const configurablePeople = people.filter((person) => hasPermission(user, "verticals.manage", person.property_id));
  const agreements = [...new Map(configurablePeople.filter((person) => person.lease_id).map((person) => [Number(person.lease_id), person])).values()];
  const canCreateRequest = configurableProperties.length > 0 && configurablePeople.length > 0;
  const submittedCount = requests.filter((item) => item.status === "submitted").length;
  const configuredCount = properties.filter((property) => property.settings_json).length;

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Vertical operating system" title="Module operations" description="Configure property rules, maintain student, workforce, guest, household, and business profiles, and review module-specific resident workflows."/>

    <section className="metric-grid module-metric-grid" aria-label="Module operations summary">
      <article className="metric-card"><span>Operating properties</span><strong>{properties.length}</strong><small>Each keeps an independent module contract</small></article>
      <article className="metric-card"><span>Active people</span><strong>{properties.reduce((sum, property) => sum + Number(property.active_people || 0), 0)}</strong><small>Residents, students, employees, guests and businesses</small></article>
      <article className={`metric-card${submittedCount ? " risk" : ""}`}><span>Requests awaiting review</span><strong>{submittedCount}</strong><small>Portal and staff-created workflows</small></article>
      <article className={`metric-card${configuredCount < properties.length ? " attention" : ""}`}><span>Configured verticals</span><strong>{configuredCount}</strong><small>{properties.length - configuredCount} property rule set(s) not saved</small></article>
    </section>

    <section className="vertical-property-grid" aria-label="Property operating model configuration">{properties.map((property) => {
      const module = moduleById(property.module_id);
      const contract = verticalContract(module.id);
      const settings = parseSettings(property.settings_json);
      const editable = hasPermission(user, "verticals.manage", property.id);
      return <article className={`vertical-property-card module-${module.id}`} key={property.id}>
        <div className="vertical-card-head"><ModuleBadge moduleId={module.id}/><Badge tone={property.status}>{property.status}</Badge></div>
        <h2>{property.name}</h2><p>{contract.label}</p>
        <div className="vertical-card-metrics"><span><strong>{property.active_people}</strong><small>{module.terminology.occupant}s</small></span><span><strong>{property.pending_requests}</strong><small>Pending requests</small></span><span><strong>{contract.config.length}</strong><small>Operating controls</small></span></div>
        <div className="vertical-card-actions">{editable && <OpenModalButton target={`config-${property.id}`} icon="settings" className="button secondary">Configure</OpenModalButton>}<a href={`#people-${property.id}`} className="text-link">View profiles</a></div>
        {editable && <form action={savePropertyOperatingConfigAction}><ModalForm id={`config-${property.id}`} title={`${property.name} · operating configuration`} description={`Configure ${contract.label.toLowerCase()} without changing shared finance, audit, or security records.`} submitLabel="Save operating rules" pendingLabel="Saving…"><div className="modal-body">
          <input type="hidden" name="propertyId" value={property.id}/><div className="summary-box"><span>Operating model</span><strong>{module.label}</strong><small>{module.description}</small></div><ConfigFields contract={contract} settings={settings}/><div className="module-form-note">Blank controls remain inherited or unspecified. Boolean controls use explicit Yes or No values.</div>
        </div></ModalForm></form>}
      </article>;
    })}</section>

    <section className="panel module-directory-section" aria-labelledby="vertical-profiles-title">
      <div className="panel-head"><div><span className="eyebrow">Domain identity</span><h2 id="vertical-profiles-title">People and vertical profiles</h2></div><span className="panel-count">{people.length} records</span></div>
      {people.length ? <div className="table-wrap"><table className="module-directory-table" data-mobile-cards="vertical-profiles" aria-label="People and vertical profiles">
        <thead><tr><th>Person</th><th>Module / property</th><th>Agreement</th><th>Domain identity</th><th>Responsible party</th><th>Actions</th></tr></thead>
        <tbody>{people.map((person) => {
          const module = moduleById(person.module_id);
          const contract = verticalContract(module.id);
          const editable = hasPermission(user, "people.manage", person.property_id);
          const identity = person.external_id || person.programme || person.department || person.organisation || "Profile not completed";
          const responsible = person.guardian_name || person.sponsor_name || person.organisation || "Not recorded";
          return <tr id={`people-${person.property_id}`} key={person.id}>
            <td data-label="Person"><div className="person-cell"><span className="avatar">{person.full_name[0]}</span><span><strong>{person.full_name}</strong><small>{person.email || person.phone || "No contact detail"}</small></span></div></td>
            <td data-label="Module / property"><ModuleBadge moduleId={module.id} compact/><strong>{person.property_name}</strong></td>
            <td data-label="Agreement"><strong>{person.lease_reference || "No active agreement"}</strong><small>{person.unit_name || "No active unit"}</small></td>
            <td data-label="Domain identity"><strong>{identity}</strong><small>{person.level_or_designation || contract.profileTitle}</small></td>
            <td data-label="Responsible party"><strong>{responsible}</strong><small>{person.guardian_phone || person.guardian_email || person.sponsor_reference || "No supporting contact"}</small></td>
            <td data-label="Actions">{editable ? <OpenModalButton target={`profile-${person.id}`} icon="edit" className="text-button">Edit profile</OpenModalButton> : <span className="muted">No profile access</span>}</td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty icon="tenant" title="No people available" text="Add people to a property before completing its module-specific profile."/>}
    </section>

    {profilePeople.map((person) => {
      const contract = verticalContract(person.module_id);
      return <form action={saveResidentVerticalProfileAction} key={`profile-form-${person.id}`}><ModalForm id={`profile-${person.id}`} title={`${person.full_name} · ${contract.profileTitle}`} description={`${person.property_name} · only fields relevant to ${contract.label.toLowerCase()} are stored.`} submitLabel="Save profile" pendingLabel="Saving…"><div className="modal-body">
        <input type="hidden" name="tenantId" value={person.id}/><div className="summary-box"><span>Active agreement</span><strong>{person.lease_reference || "No active agreement"}</strong><small>{person.unit_name || person.property_name}</small></div><ProfileFields contract={contract} profile={person}/><div className="module-form-note">Student guardian, staff eligibility, payroll and sponsor data remain property-scoped and audit logged.</div>
      </div></ModalForm></form>;
    })}

    <section className="panel module-directory-section" aria-labelledby="module-requests-title">
      <div className="panel-head"><div><span className="eyebrow">Approvals and resident workflows</span><h2 id="module-requests-title">Module requests</h2></div>{canCreateRequest && <OpenModalButton target="request-create" icon="plus" className="button secondary">Create request</OpenModalButton>}</div>
      {requests.length ? <div className="table-wrap"><table className="module-directory-table" data-mobile-cards="module-requests" aria-label="Module request register">
        <thead><tr><th>Request</th><th>Person / property</th><th>Window</th><th>Status</th><th>Resolution</th><th>Actions</th></tr></thead>
        <tbody>{requests.map((request) => {
          const canReviewRequest = hasPermission(user, "requests.review", request.property_id);
          return <tr key={request.id}>
            <td data-label="Request"><strong>{request.title}</strong><small>{requestLabel(request.request_type)} · {dateTimeLabel(request.created_at)}</small></td>
            <td data-label="Person / property"><strong>{request.tenant_name}</strong><small>{request.property_name} · {request.lease_reference || "No agreement"}</small></td>
            <td data-label="Window"><strong>{request.starts_at ? dateTimeLabel(request.starts_at) : "Not specified"}</strong><small>{request.ends_at ? `to ${dateTimeLabel(request.ends_at)}` : "No end specified"}</small></td>
            <td data-label="Status"><Badge tone={request.status}>{request.status.replaceAll("_", " ")}</Badge></td>
            <td data-label="Resolution"><strong>{request.resolution_note || "No decision note"}</strong><small>{request.reviewer_name || "Not reviewed"}</small></td>
            <td data-label="Actions">{canReviewRequest && ["submitted", "approved"].includes(request.status) ? <OpenModalButton target={`request-review-${request.id}`} className="button secondary small">Review request</OpenModalButton> : <span className="muted">No action</span>}</td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty icon="portal" title="No module requests" text="Residents can submit module-relevant requests from their portal, or staff can create one on their behalf."/>}
    </section>

    {canCreateRequest && <form action={createModuleRequestAction}><ModalForm id="request-create" title="Create module request" description="The server validates that the property, person, agreement, and request type belong to one operating model." submitLabel="Create request" pendingLabel="Creating…"><div className="modal-body">
      <label><span>Property</span><select name="propertyId" required>{configurableProperties.map((property) => <option value={property.id} key={property.id}>{property.name} · {moduleById(property.module_id).shortLabel}</option>)}</select></label>
      <label><span>Person</span><select name="tenantId" required>{configurableProperties.map((property) => <optgroup label={property.name} key={property.id}>{configurablePeople.filter((person) => Number(person.property_id) === Number(property.id)).map((person) => <option value={person.id} key={person.id}>{person.full_name}</option>)}</optgroup>)}</select></label>
      <label><span>Active agreement (optional)</span><select name="leaseId"><option value="">No agreement</option>{configurableProperties.map((property) => <optgroup label={property.name} key={property.id}>{agreements.filter((person) => Number(person.property_id) === Number(property.id)).map((person) => <option value={person.lease_id} key={person.lease_id}>{person.full_name} · {person.lease_reference}</option>)}</optgroup>)}</select></label>
      <label><span>Request type</span><select name="requestType" required>{configurableProperties.map((property) => <optgroup label={`${property.name} · ${moduleById(property.module_id).shortLabel}`} key={property.id}>{verticalContract(property.module_id).requestTypes.map((type) => <option value={type} key={`${property.id}-${type}`}>{requestLabel(type)}</option>)}</optgroup>)}</select></label>
      <label><span>Title</span><input name="title" required maxLength="180"/></label><label><span>Details</span><textarea name="details" rows="4" maxLength="4000"/></label>
      <div className="field-grid two"><label><span>Starts</span><input type="datetime-local" name="startsAt"/></label><label><span>Ends</span><input type="datetime-local" name="endsAt"/></label></div>
      <div className="module-form-note">Choose all values from the same property group. Mismatched relationships are rejected before the request is created.</div>
    </div></ModalForm></form>}

    {requests.filter((request) => hasPermission(user, "requests.review", request.property_id) && ["submitted", "approved"].includes(request.status)).map((request) => <form action={reviewModuleRequestAction} key={`review-${request.id}`}><ModalForm id={`request-review-${request.id}`} title={`Review · ${request.title}`} description={`${request.tenant_name} · ${request.property_name} · ${requestLabel(request.request_type)}`} submitLabel="Save decision" pendingLabel="Saving…"><div className="modal-body">
      <input type="hidden" name="requestId" value={request.id}/><div className="summary-box"><span>Resident details</span><strong>{request.details || "No additional details"}</strong><small>{request.starts_at ? `${dateTimeLabel(request.starts_at)}${request.ends_at ? ` to ${dateTimeLabel(request.ends_at)}` : ""}` : "No requested window"}</small></div>
      <label><span>Decision</span><select name="status" defaultValue={request.status === "approved" ? "completed" : "approved"}>{request.status === "submitted" && <><option value="approved">Approve</option><option value="rejected">Reject</option></>}<option value="completed">Complete</option><option value="cancelled">Cancel</option></select></label>
      <label><span>Resolution note</span><textarea name="resolutionNote" rows="4" maxLength="2000" required/></label>
    </div></ModalForm></form>)}
  </>;
}
