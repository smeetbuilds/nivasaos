import { cancelTenantModuleRequestAction, createTenantModuleRequestAction } from "@/app/actions";
import { requireTenant } from "@/lib/tenant-auth";
import { all, get } from "@/lib/db";
import { dateTimeLabel } from "@/lib/format";
import { moduleById } from "@/lib/modules/catalog";
import { requestLabel, verticalContract } from "@/lib/verticals";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import ConfirmAction from "@/components/ConfirmAction";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Icon from "@/components/Icon";

export const metadata = { title: "Requests" };

export default async function PortalRequestsPage({ searchParams }) {
  const tenant = await requireTenant();
  const query = await searchParams;
  const module = moduleById(tenant.module_id);
  const contract = verticalContract(module.id);
  const requests = all(
    `SELECT * FROM module_requests WHERE tenant_id=$tenantId ORDER BY CASE status WHEN 'submitted' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,created_at DESC,id DESC`,
    { tenantId: tenant.tenant_id }
  );
  const profile = get("SELECT * FROM resident_vertical_profiles WHERE tenant_id=$tenantId", { tenantId: tenant.tenant_id });
  const pending = requests.filter((item) => item.status === "submitted").length;
  const approved = requests.filter((item) => item.status === "approved").length;
  const completed = requests.filter((item) => item.status === "completed").length;
  const requestTypeLabels = contract.portalActions.map(requestLabel);
  const emptyRequestCopy = requestTypeLabels.length
    ? `Use this centre for ${requestTypeLabels.join(", ")}.`
    : `No self-service request types are configured for ${module.shortLabel}.`;

  return <>
    <Flash searchParams={query}/>
    <header className="portal-page-head"><div><span className="eyebrow">{contract.label}</span><h1>Requests and approvals</h1><p>Submit only workflows supported by your property’s operating model. The property team’s decision and resolution note remain in your portal history.</p></div>{contract.portalActions.length > 0 && <OpenModalButton target="portal-request-create" icon="plus">New request</OpenModalButton>}</header>

    <section className="portal-metric-grid" aria-label="Resident request summary"><article className={pending ? "is-risk" : ""}><span>Awaiting review</span><strong>{pending}</strong><small>Submitted to the property team</small></article><article className={approved ? "is-attention" : ""}><span>Approved in progress</span><strong>{approved}</strong><small>Waiting for completion</small></article><article><span>Completed</span><strong>{completed}</strong><small>Retained in your history</small></article><article><span>Available request types</span><strong>{contract.portalActions.length}</strong><small>Configured for {module.shortLabel}</small></article></section>

    {profile && <section className={`portal-card portal-domain-profile module-${module.id}`} aria-labelledby="portal-domain-profile-title"><div className="portal-card-head"><div><span className="eyebrow">Your module profile</span><h2 id="portal-domain-profile-title">{contract.profileTitle}</h2></div><Icon name={module.icon} size={22}/></div><div className="portal-detail-grid portal-domain-grid">{profile.external_id&&<span><small>Reference ID</small><strong>{profile.external_id}</strong></span>}{profile.organisation&&<span><small>Organisation</small><strong>{profile.organisation}</strong></span>}{profile.department&&<span><small>Department</small><strong>{profile.department}</strong></span>}{profile.programme&&<span><small>Programme</small><strong>{profile.programme}</strong></span>}{profile.level_or_designation&&<span><small>Level / designation</small><strong>{profile.level_or_designation}</strong></span>}{profile.guardian_name&&<span><small>Guardian</small><strong>{profile.guardian_name}</strong></span>}{profile.sponsor_name&&<span><small>Sponsor</small><strong>{profile.sponsor_name}</strong></span>}{profile.eligibility_end_date&&<span><small>Eligibility ends</small><strong>{profile.eligibility_end_date}</strong></span>}</div></section>}

    <section className="portal-card" aria-labelledby="portal-request-history-title"><div className="portal-card-head"><div><span className="eyebrow">Workflow history</span><h2 id="portal-request-history-title">Your requests</h2></div><span className="portal-section-count">{requests.length}</span></div>{requests.length ? <div className="portal-request-list">{requests.map((request) => {
      const titleId = `portal-request-${request.id}`;
      return <article key={request.id} aria-labelledby={titleId}><span className="portal-request-icon"><Icon name="portal" size={18}/></span><span><strong id={titleId}>{request.title}</strong><small>{requestLabel(request.request_type)} · submitted {dateTimeLabel(request.created_at)}</small><p>{request.details || "No additional detail"}</p>{request.resolution_note&&<em>{request.resolution_note}</em>}</span><div className="portal-request-state"><Badge tone={request.status}>{request.status.replaceAll("_", " ")}</Badge>{request.starts_at&&<small>{dateTimeLabel(request.starts_at)}{request.ends_at?` to ${dateTimeLabel(request.ends_at)}`:""}</small>}{request.status==="submitted"&&<ConfirmAction action={cancelTenantModuleRequestAction} id={`cancel-portal-request-${request.id}`} triggerLabel="Cancel request" triggerClassName="text-button danger" title={`Cancel “${request.title}”?`} description={requestLabel(request.request_type)} submitLabel="Cancel request" pendingLabel="Cancelling…"><div className="modal-body"><input type="hidden" name="requestId" value={request.id}/><div className="confirm-consequence">The request remains in history as cancelled, and the property team will no longer process it.</div></div></ConfirmAction>}</div></article>;
    })}</div> : <div className="portal-empty-state"><Icon name="portal" size={28}/><strong>No requests yet</strong><p>{emptyRequestCopy}</p></div>}</section>

    {contract.portalActions.length > 0 && <form action={createTenantModuleRequestAction}><ModalForm id="portal-request-create" title={`New ${module.shortLabel} request`} description="Your active agreement and property relationship are verified automatically." submitLabel="Submit request" pendingLabel="Submitting…"><div className="modal-body"><label><span>Request type</span><select name="requestType" required>{contract.portalActions.map((type)=><option value={type} key={type}>{requestLabel(type)}</option>)}</select></label><label><span>Title</span><input name="title" required placeholder="Brief summary"/></label><label><span>Details</span><textarea name="details" rows="5" required placeholder="Explain what you need, relevant dates, and any constraints."/></label><div className="field-grid two"><label><span>Start date and time (optional)</span><input type="datetime-local" name="startsAt"/></label><label><span>End date and time (optional)</span><input type="datetime-local" name="endsAt"/></label></div><div className="policy-warning">Submitting a request does not guarantee approval. Keep emergency and safety issues in the maintenance or emergency channels.</div></div></ModalForm></form>}
  </>;
}
