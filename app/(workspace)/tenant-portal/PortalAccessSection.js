import Link from "next/link";
import { createTenantInviteAction, disableTenantPortalAction } from "@/app/actions";
import { dateLabel, dateTimeLabel } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import Badge from "@/components/Badge";
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
    {inviteUrl && invitedTenant && <section className="portal-share-banner panel">
      <div><span className="eyebrow">One-time link · expires in 7 days</span><h2>Share portal access with {invitedTenant.full_name}</h2><p>The raw token is shown through a five-minute authenticated HTTP-only handoff and is stored in the database only as a hash. Replaced, disabled, consumed, or expired links are never displayed.</p><code>{inviteUrl}</code></div>
      <CopyPortalLink url={inviteUrl} whatsappUrl={whatsappUrl}/>
    </section>}

    <section className="metric-grid portal-admin-metrics">
      {canManageAccess && <article className="metric-card"><span>Active portal accounts</span><strong>{activeAccounts}</strong><small>Residents who have set a password</small></article>}
      {canManageAccess && <article className="metric-card"><span>Invitations pending</span><strong>{invitedAccounts}</strong><small>Activation links not completed</small></article>}
      {canReviewPayments && <article className="metric-card risk"><span>Payments awaiting review</span><strong>{pendingCount}</strong><small>Proof submissions do not alter balances until approved</small></article>}
      {canManageDeposits && <article className="metric-card"><span>Deposit ledger balance</span><strong>{depositMetric}</strong><small>Received and credits minus refunds and debits</small></article>}
    </section>

    {canManageAccess && <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">Access control</span><h2>Resident accounts</h2></div><span className="muted">{portalTenants.length} tenant profiles</span></div>
      {portalTenants.length ? <div className="table-wrap"><table><thead><tr><th>Tenant</th><th>Home</th><th>Portal status</th><th>Last access</th><th>Actions</th></tr></thead><tbody>{portalTenants.map((tenant) => {
        const canManageTenant = hasPermission(user, "portal.manage", tenant.property_id);
        return <tr key={tenant.id} className={Number(tenant.id) === selectedTenantId ? "is-highlighted" : ""}>
          <td><div className="person-cell"><span className="avatar">{tenant.full_name[0]}</span><span><strong>{tenant.full_name}</strong><small>{tenant.email || "Email required for portal"}</small></span></div></td>
          <td>{tenant.property_name}<small>{tenant.unit_name || "No active lease"}</small></td>
          <td><Badge tone={tenant.portal_status === "invited" && !tenant.invite_active ? "overdue" : tenant.portal_status || "inactive"}>{tenant.portal_status === "invited" && !tenant.invite_active ? "Invite expired" : tenant.portal_status || "Not enabled"}</Badge></td>
          <td>{tenant.last_login_at ? dateTimeLabel(tenant.last_login_at) : "Never"}<small>{tenant.activated_at ? `Activated ${dateLabel(tenant.activated_at.slice(0, 10))}` : tenant.invited_at ? `Invited ${dateLabel(tenant.invited_at.slice(0, 10))}` : "—"}</small></td>
          <td><div className="table-actions">
            {canManageTenant && tenant.email ? <form action={createTenantInviteAction}><input type="hidden" name="tenantId" value={tenant.id}/><button className="text-button"><Icon name="portal" size={16}/>{tenant.portal_status === "active" ? "Reset link" : "Create invite"}</button></form> : <span className="muted">{tenant.email ? "No access" : "Add email first"}</span>}
            {canManageTenant && tenant.account_id && tenant.portal_status !== "disabled" && <form action={disableTenantPortalAction}><input type="hidden" name="tenantId" value={tenant.id}/><button className="text-button danger-text">Disable</button></form>}
          </div></td>
        </tr>;
      })}</tbody></table></div> : <Empty icon="tenant" title="No tenant profiles" text="No resident profiles are available within your portal-management scope."/>}
    </section>}
  </>;
}
