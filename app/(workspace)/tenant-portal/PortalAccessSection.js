import { createTenantInviteAction, disableTenantPortalAction } from "@/app/actions";
import { dateLabel, dateTimeLabel } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import ActionButton from "@/components/ActionButton";
import Badge from "@/components/Badge";
import ConfirmAction from "@/components/ConfirmAction";
import CopyPortalLink from "@/components/CopyPortalLink";
import Empty from "@/components/Empty";
import Icon from "@/components/Icon";

export default function PortalAccessSection({
  user,
  canManageAccess,
  canReviewPayments,
  canManageDeposits,
  inviteUrl,
  invitedTenant,
  whatsappUrl,
  activeAccounts,
  invitedAccounts,
  pendingCount,
  depositMetric,
  portalTenants,
  selectedTenantId
}) {
  return <>
    {inviteUrl && invitedTenant && <section className="portal-share-banner panel" aria-labelledby="portal-share-title">
      <div><span className="eyebrow">One-time link · expires in 7 days</span><h2 id="portal-share-title">Share portal access with {invitedTenant.full_name}</h2><p>The raw token is shown through a five-minute authenticated HTTP-only handoff and is stored in the database only as a hash. Replaced, disabled, consumed, or expired links are never displayed.</p><code>{inviteUrl}</code></div>
      <CopyPortalLink url={inviteUrl} whatsappUrl={whatsappUrl}/>
    </section>}

    <section className="metric-grid portal-admin-metrics" aria-label="Portal administration summary">
      {canManageAccess && <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="portal"/></div><span>Active portal accounts</span><strong>{activeAccounts}</strong><small>Residents who have set a password</small></article>}
      {canManageAccess && <article className={`metric-card compact-metric${invitedAccounts ? " risk" : ""}`}><div className="metric-icon"><Icon name="document"/></div><span>Invitations pending</span><strong>{invitedAccounts}</strong><small>Activation links not completed</small></article>}
      {canReviewPayments && <article className={`metric-card compact-metric${pendingCount ? " risk" : ""}`}><div className="metric-icon"><Icon name="payment"/></div><span>Payments awaiting review</span><strong>{pendingCount}</strong><small>Proof submissions do not alter balances until approved</small></article>}
      {canManageDeposits && <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="deposit"/></div><span>Deposit ledger balance</span><strong>{depositMetric}</strong><small>Received and credits minus refunds and debits</small></article>}
    </section>

    {canManageAccess && <section className="panel portal-admin-section" aria-labelledby="portal-account-directory-title">
      <div className="panel-head"><div><span className="eyebrow">Access control</span><h2 id="portal-account-directory-title">Resident accounts</h2></div><span className="panel-count">{portalTenants.length} tenant profiles</span></div>
      {portalTenants.length ? <div className="table-wrap"><table className="portal-admin-table" data-mobile-cards="portal-accounts" aria-label="Resident portal accounts"><thead><tr><th>Tenant</th><th>Home</th><th>Portal status</th><th>Last access</th><th>Actions</th></tr></thead><tbody>{portalTenants.map((tenant) => {
        const canManageTenant = hasPermission(user, "portal.manage", tenant.property_id);
        const inviteLabel = tenant.portal_status === "active" ? "Create reset link" : "Create invite";
        return <tr key={tenant.id} className={Number(tenant.id) === selectedTenantId ? "is-highlighted" : ""}>
          <td data-label="Tenant"><div className="person-cell"><span className="avatar">{tenant.full_name[0]}</span><span><strong>{tenant.full_name}</strong><small>{tenant.email || "Email required for portal"}</small></span></div></td>
          <td data-label="Home"><strong>{tenant.property_name}</strong><small>{tenant.unit_name || "No active agreement"}</small></td>
          <td data-label="Portal status"><Badge tone={tenant.portal_status === "invited" && !tenant.invite_active ? "overdue" : tenant.portal_status || "inactive"}>{tenant.portal_status === "invited" && !tenant.invite_active ? "Invite expired" : tenant.portal_status || "Not enabled"}</Badge></td>
          <td data-label="Last access"><strong>{tenant.last_login_at ? dateTimeLabel(tenant.last_login_at) : "Never"}</strong><small>{tenant.activated_at ? `Activated ${dateLabel(tenant.activated_at.slice(0, 10))}` : tenant.invited_at ? `Invited ${dateLabel(tenant.invited_at.slice(0, 10))}` : "No invite created"}</small></td>
          <td data-label="Actions"><div className="table-actions portal-account-actions">
            {canManageTenant && tenant.email ? <form action={createTenantInviteAction}><input type="hidden" name="tenantId" value={tenant.id}/><ActionButton className="button secondary small" pendingLabel="Creating…"><Icon name="portal" size={16}/>{inviteLabel}</ActionButton></form> : <span className="muted">{tenant.email ? "No access" : "Add email first"}</span>}
            {canManageTenant && tenant.account_id && tenant.portal_status !== "disabled" && <ConfirmAction action={disableTenantPortalAction} id={`disable-portal-${tenant.id}`} triggerLabel="Disable portal" triggerClassName="text-button" title={`Disable ${tenant.full_name}'s portal?`} description={`${tenant.property_name} · ${tenant.email || "No email"}`} submitLabel="Disable portal" pendingLabel="Disabling…"><div className="modal-body"><input type="hidden" name="tenantId" value={tenant.id}/><div className="confirm-consequence">This revokes active portal sessions and prevents sign-in until a new invitation is created.</div></div></ConfirmAction>}
          </div></td>
        </tr>;
      })}</tbody></table></div> : <Empty icon="tenant" title="No tenant profiles" text="No resident profiles are available within your portal-management scope."/>}
    </section>}
  </>;
}
