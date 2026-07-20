import { cookies } from "next/headers";
import Link from "next/link";
import {
  createTenantInviteAction,
  disableTenantPortalAction,
  recordDepositTransactionAction,
  reviewPaymentSubmissionAction
} from "@/app/actions";
import { requireUser, propertyScopeSql } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { dateLabel, dateTimeLabel, money, today } from "@/lib/format";
import { extensions } from "@/lib/extensions";
import { configuredPublicUrl } from "@/lib/runtime-config";
import { hashPortalToken } from "@/lib/tenant-auth";
import { PORTAL_HANDOFF_COOKIE, readPortalInviteHandoff } from "@/lib/portal-handoff";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import CopyPortalLink from "@/components/CopyPortalLink";
import Icon from "@/components/Icon";

export const metadata = { title: "Tenant portal" };

function heldSign(type) {
  return ["received", "credit"].includes(type) ? 1 : -1;
}

export default async function TenantPortalAdminPage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const query = await searchParams;
  const nowIso = new Date().toISOString();
  const handoffStore = await cookies();
  const parsedHandoff = readPortalInviteHandoff(handoffStore.get(PORTAL_HANDOFF_COOKIE)?.value);
  const inviteHandoff = parsedHandoff && get(
    `SELECT 1 FROM tenant_invites ti
     JOIN tenant_accounts ta ON ta.id=ti.account_id
     WHERE ta.tenant_id=$tenantId AND ta.status!='disabled' AND ti.token_hash=$tokenHash
       AND ti.consumed_at IS NULL AND ti.expires_at>$now`,
    { tenantId: parsedHandoff.tenantId, tokenHash: hashPortalToken(parsedHandoff.token), now: nowIso }
  ) ? parsedHandoff : null;
  const canManageAccess = true;
  const selectedTenantId = Number(query?.tenant || inviteHandoff?.tenantId || 0);
  const tenants = all(
    `SELECT t.*,p.name property_name,p.currency,ta.id account_id,ta.status portal_status,ta.invited_at,ta.activated_at,ta.last_login_at,
      l.id active_lease_id,l.reference lease_reference,u.name unit_name,
      EXISTS(SELECT 1 FROM tenant_invites active_invite WHERE active_invite.account_id=ta.id AND active_invite.consumed_at IS NULL AND active_invite.expires_at>$now) invite_active
     FROM tenants t JOIN properties p ON p.id=t.property_id
     LEFT JOIN tenant_accounts ta ON ta.tenant_id=t.id
     LEFT JOIN lease_tenants lt ON lt.tenant_id=t.id
     LEFT JOIN leases l ON l.id=lt.lease_id AND l.status='active'
     LEFT JOIN units u ON u.id=l.unit_id
     WHERE ${scope.clause}
     GROUP BY t.id ORDER BY t.full_name`,
    { ...scope.params, now: nowIso }
  );
  const submissions = all(
    `SELECT ps.*,p.name property_name,p.currency,t.full_name tenant_name,i.number invoice_number,
      i.amount-i.amount_paid invoice_balance
     FROM payment_submissions ps
     JOIN properties p ON p.id=ps.property_id
     JOIN tenants t ON t.id=ps.tenant_id
     LEFT JOIN invoices i ON i.id=ps.invoice_id
     WHERE ${scope.clause}
     ORDER BY CASE ps.status WHEN 'pending' THEN 0 ELSE 1 END,ps.created_at DESC LIMIT 100`,
    scope.params
  );
  const deposits = all(
    `SELECT dt.*,p.name property_name,p.currency,l.reference lease_reference,u.name unit_name,t.full_name tenant_name
     FROM deposit_transactions dt
     JOIN properties p ON p.id=dt.property_id
     JOIN leases l ON l.id=dt.lease_id
     JOIN units u ON u.id=l.unit_id
     LEFT JOIN tenants t ON t.id=dt.tenant_id
     WHERE ${scope.clause}
     ORDER BY dt.transacted_at DESC,dt.id DESC LIMIT 100`,
    scope.params
  );
  const leases = all(
    `SELECT l.id,l.reference,l.property_id,p.name property_name,p.currency,u.name unit_name,l.deposit,
      COALESCE((SELECT SUM(CASE dt.transaction_type WHEN 'received' THEN dt.amount WHEN 'credit' THEN dt.amount ELSE -dt.amount END) FROM deposit_transactions dt WHERE dt.lease_id=l.id),0) held
     FROM leases l JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id
     WHERE ${scope.clause} AND l.status='active' ORDER BY p.name,u.name`,
    scope.params
  );
  const pending = submissions.filter((item) => item.status === "pending");
  const activeAccounts = tenants.filter((item) => item.portal_status === "active").length;
  const invitedAccounts = tenants.filter((item) => item.portal_status === "invited" && item.invite_active).length;
  const depositGroups = [...deposits.reduce((map, row) => map.set(row.currency, (map.get(row.currency) || 0) + heldSign(row.transaction_type) * Number(row.amount)), new Map()).entries()];
  const depositMetric = depositGroups.length === 0 ? money(0) : depositGroups.length === 1 ? money(depositGroups[0][1], depositGroups[0][0]) : `${depositGroups.length} currencies`;
  const invitedTenant = inviteHandoff ? tenants.find((item) => Number(item.id) === inviteHandoff.tenantId) : null;
  const appUrl = configuredPublicUrl() || "http://localhost:3000";
  const inviteUrl = invitedTenant && inviteHandoff ? `${appUrl}/portal/activate/${inviteHandoff.token}` : null;
  const phone = invitedTenant?.phone?.replace(/\D/g, "");
  const shareText = invitedTenant && inviteUrl ? `Hello ${invitedTenant.full_name}, your secure ${invitedTenant.property_name} resident portal is ready. Use this one-time link within 7 days to set your password: ${inviteUrl}` : "";
  const whatsappUrl = phone && shareText ? `https://wa.me/${phone}?text=${encodeURIComponent(shareText)}` : null;
  const methods = [...extensions.paymentMethods.values()];

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Resident self-service" title="Tenant portal" description="Invite residents securely, review payment proofs, maintain deposit ledgers, and give tenants a trustworthy view of their home and account." actions={<><Link href="/tenants" className="button secondary"><Icon name="tenant" size={17}/>Tenant profiles</Link><OpenModalButton target="deposit-modal" icon="deposit">Record deposit</OpenModalButton></>}/>

    {inviteUrl && invitedTenant && <section className="portal-share-banner panel">
      <div><span className="eyebrow">One-time link · expires in 7 days</span><h2>Share portal access with {invitedTenant.full_name}</h2><p>The raw token is shown through a five-minute authenticated HTTP-only handoff and is stored in the database only as a hash. Replaced, disabled, consumed, or expired links are never displayed.</p><code>{inviteUrl}</code></div>
      <CopyPortalLink url={inviteUrl} whatsappUrl={whatsappUrl}/>
    </section>}

    <section className="metric-grid portal-admin-metrics">
      <article className="metric-card"><span>Active portal accounts</span><strong>{activeAccounts}</strong><small>Residents who have set a password</small></article>
      <article className="metric-card"><span>Invitations pending</span><strong>{invitedAccounts}</strong><small>Activation links not completed</small></article>
      <article className="metric-card risk"><span>Payments awaiting review</span><strong>{pending.length}</strong><small>Proof submissions do not alter balances until approved</small></article>
      <article className="metric-card"><span>Deposit ledger balance</span><strong>{depositMetric}</strong><small>Received and credits minus refunds and debits</small></article>
    </section>

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">Access control</span><h2>Resident accounts</h2></div><span className="muted">{tenants.length} tenant profiles</span></div>
      {tenants.length ? <div className="table-wrap"><table><thead><tr><th>Tenant</th><th>Home</th><th>Portal status</th><th>Last access</th><th>Actions</th></tr></thead><tbody>{tenants.map((tenant) => <tr key={tenant.id} className={Number(tenant.id) === selectedTenantId ? "is-highlighted" : ""}>
        <td><div className="person-cell"><span className="avatar">{tenant.full_name[0]}</span><span><strong>{tenant.full_name}</strong><small>{tenant.email || "Email required for portal"}</small></span></div></td>
        <td>{tenant.property_name}<small>{tenant.unit_name || "No active lease"}</small></td>
        <td><Badge tone={tenant.portal_status === "invited" && !tenant.invite_active ? "overdue" : tenant.portal_status || "inactive"}>{tenant.portal_status === "invited" && !tenant.invite_active ? "Invite expired" : tenant.portal_status || "Not enabled"}</Badge></td>
        <td>{tenant.last_login_at ? dateTimeLabel(tenant.last_login_at) : "Never"}<small>{tenant.activated_at ? `Activated ${dateLabel(tenant.activated_at.slice(0, 10))}` : tenant.invited_at ? `Invited ${dateLabel(tenant.invited_at.slice(0, 10))}` : "—"}</small></td>
        <td><div className="table-actions">
          {canManageAccess && tenant.email ? <form action={createTenantInviteAction}><input type="hidden" name="tenantId" value={tenant.id}/><button className="text-button"><Icon name="portal" size={16}/>{tenant.portal_status === "active" ? "Reset link" : "Create invite"}</button></form> : <span className="muted">Add email first</span>}
          {canManageAccess && tenant.account_id && tenant.portal_status !== "disabled" && <form action={disableTenantPortalAction}><input type="hidden" name="tenantId" value={tenant.id}/><button className="text-button danger-text">Disable</button></form>}
        </div></td>
      </tr>)}</tbody></table></div> : <Empty icon="tenant" title="No tenant profiles" text="Add tenants before creating portal access."/>}
    </section>

    <section className="panel portal-review-panel">
      <div className="panel-head"><div><span className="eyebrow">Controlled reconciliation</span><h2>Tenant payment submissions</h2></div><Badge tone={pending.length ? "overdue" : "paid"}>{pending.length ? `${pending.length} pending` : "Queue clear"}</Badge></div>
      {submissions.length ? <div className="table-wrap"><table><thead><tr><th>Submitted</th><th>Tenant / invoice</th><th>Amount</th><th>Payment details</th><th>Status</th><th>Review</th></tr></thead><tbody>{submissions.map((item) => <tr key={item.id}>
        <td>{dateTimeLabel(item.created_at)}<small>Paid {dateLabel(item.paid_at)}</small></td>
        <td><strong>{item.tenant_name}</strong><small>{item.invoice_number || "No invoice"} · {item.property_name}</small></td>
        <td><strong>{money(item.amount, item.currency)}</strong><small>{item.invoice_number ? `${money(item.invoice_balance, item.currency)} current balance` : ""}</small></td>
        <td>{item.method.replaceAll("_", " ")}<small>{item.external_reference || "No external reference"}</small><a href={`/api/payment-submissions/${item.id}/proof`} className="text-link" target="_blank">View proof</a></td>
        <td><Badge tone={item.status}>{item.status}</Badge>{item.review_note && <small>{item.review_note}</small>}</td>
        <td>{item.status === "pending" ? <div className="table-actions"><form action={reviewPaymentSubmissionAction}><input type="hidden" name="submissionId" value={item.id}/><input type="hidden" name="decision" value="approved"/><button className="text-button">Approve</button></form><OpenModalButton target={`reject-submission-${item.id}`} className="text-button danger-text">Reject</OpenModalButton></div> : item.payment_id ? <Link className="text-link" href={`/api/proofs/${item.payment_id}`} target="_blank">Approved proof</Link> : <span className="muted">Reviewed</span>}</td>
      </tr>)}</tbody></table></div> : <Empty icon="payment" title="No tenant payment submissions" text="Tenant-submitted proofs appear here for staff review before the financial ledger changes."/>}
    </section>

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">Refundable money</span><h2>Deposit transactions</h2></div><OpenModalButton target="deposit-modal" icon="plus" className="button secondary">Add transaction</OpenModalButton></div>
      {deposits.length ? <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Tenant / lease</th><th>Property / unit</th><th>Date</th><th>Type</th><th>Amount</th><th>Proof</th></tr></thead><tbody>{deposits.map((item) => <tr key={item.id}><td><strong>{item.reference}</strong></td><td>{item.tenant_name || "Lease-level"}<small>{item.lease_reference}</small></td><td>{item.property_name}<small>{item.unit_name}</small></td><td>{dateLabel(item.transacted_at)}</td><td><Badge tone={["received", "credit"].includes(item.transaction_type) ? "paid" : "overdue"}>{item.transaction_type}</Badge></td><td><strong>{heldSign(item.transaction_type) > 0 ? "+" : "−"}{money(item.amount, item.currency)}</strong></td><td>{item.proof_path ? <a className="text-link" href={`/api/deposit-proofs/${item.id}`} target="_blank">View proof</a> : <span className="muted">None</span>}</td></tr>)}</tbody></table></div> : <Empty icon="deposit" title="No deposit activity" text="Record received deposits, refunds, and documented adjustments against a lease."/>}
    </section>

    <form action={recordDepositTransactionAction}><ModalForm id="deposit-modal" title="Record deposit transaction" description="Deposit records are separate from rent payments and remain visible to every tenant on the lease." submitLabel="Record transaction" pendingLabel="Recording…"><div className="modal-body">
      <label><span>Active lease</span><select name="leaseId" required><option value="">Select lease</option>{leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.property_name} · {lease.unit_name} · {lease.reference} · held {money(lease.held, lease.currency)}</option>)}</select></label>
      <label><span>Tenant attribution (optional)</span><select name="tenantId"><option value="">Lease-level transaction</option>{tenants.filter((tenant) => tenant.active_lease_id).map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.full_name} · {tenant.property_name} · {tenant.unit_name}</option>)}</select><small>The server verifies the tenant belongs to the selected lease.</small></label>
      <div className="field-grid two"><label><span>Transaction type</span><select name="transactionType"><option value="received">Deposit received</option><option value="refund">Deposit refund</option><option value="credit">Credit adjustment</option><option value="debit">Debit adjustment</option></select></label><label><span>Amount</span><input name="amount" type="number" min="0.01" step="0.01" required/></label></div>
      <div className="field-grid two"><label><span>Method</span><select name="method">{methods.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}</select></label><label><span>Transaction date</span><input name="transactedAt" type="date" defaultValue={today()} required/></label></div>
      <label><span>Proof (optional)</span><input type="file" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf"/><small>JPG, PNG, WebP, or PDF up to 5 MB.</small></label><label><span>Notes</span><textarea name="notes" rows="3" placeholder="Refund reason, bank reference, deduction explanation, or handover note"/></label>
    </div></ModalForm></form>

    {pending.map((item) => <form action={reviewPaymentSubmissionAction} key={`reject-${item.id}`}><ModalForm id={`reject-submission-${item.id}`} title={`Reject ${item.tenant_name}'s submission`} description="The proof remains in history, but no payment is created and the invoice balance is unchanged." submitLabel="Reject submission" pendingLabel="Rejecting…"><div className="modal-body"><input type="hidden" name="submissionId" value={item.id}/><input type="hidden" name="decision" value="rejected"/><div className="summary-box"><span>Submission</span><strong>{money(item.amount, item.currency)} · {item.invoice_number}</strong><small>{item.external_reference || "No external reference"}</small></div><label><span>Reason visible to tenant</span><textarea name="reviewNote" rows="4" required placeholder="Example: The transfer reference could not be matched. Please upload a clearer proof."/></label></div></ModalForm></form>)}
  </>;
}
