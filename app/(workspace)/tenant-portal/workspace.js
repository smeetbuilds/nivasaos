import { cookies } from "next/headers";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { money } from "@/lib/format";
import { extensions } from "@/lib/extensions";
import { configuredPublicUrl } from "@/lib/runtime-config";
import { hashPortalToken } from "@/lib/tenant-auth";
import { PORTAL_HANDOFF_COOKIE, readPortalInviteHandoff } from "@/lib/portal-handoff";
import { hasPortfolioPermission } from "@/lib/permission-core";
import { permissionScopeSql } from "@/lib/permissions";
import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import Flash from "@/components/Flash";
import Icon from "@/components/Icon";
import PortalAccessSection from "./PortalAccessSection";
import PortalPaymentSection from "./PortalPaymentSection";
import PortalDepositSection from "./PortalDepositSection";

export const metadata = { title: "Tenant portal" };

function heldSign(type) {
  return ["received", "credit"].includes(type) ? 1 : -1;
}

function tenantDirectory(scope, nowIso) {
  return all(
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
}

export default async function TenantPortalAdminPage({ searchParams }) {
  const user = await requireUser();
  const portalScope = permissionScopeSql(user, "portal.manage", "p");
  const paymentScope = permissionScopeSql(user, "payments.manage", "p");
  const depositScope = permissionScopeSql(user, "deposits.manage", "p");
  const canManageAccess = hasPortfolioPermission(user, "portal.manage");
  const canReviewPayments = hasPortfolioPermission(user, "payments.manage");
  const canManageDeposits = hasPortfolioPermission(user, "deposits.manage");
  const canViewPeople = hasPortfolioPermission(user, "people.manage");
  const query = await searchParams;
  const nowIso = new Date().toISOString();
  const handoffStore = await cookies();
  const parsedHandoff = canManageAccess ? readPortalInviteHandoff(handoffStore.get(PORTAL_HANDOFF_COOKIE)?.value) : null;
  const inviteHandoff = parsedHandoff && get(
    `SELECT 1 FROM tenant_invites ti
     JOIN tenant_accounts ta ON ta.id=ti.account_id
     JOIN tenants t ON t.id=ta.tenant_id
     JOIN properties p ON p.id=t.property_id
     WHERE ta.tenant_id=$tenantId AND ta.status!='disabled' AND ti.token_hash=$tokenHash
       AND ti.consumed_at IS NULL AND ti.expires_at>$now AND ${portalScope.clause}`,
    { ...portalScope.params, tenantId: parsedHandoff.tenantId, tokenHash: hashPortalToken(parsedHandoff.token), now: nowIso }
  ) ? parsedHandoff : null;
  const portalTenants = canManageAccess ? tenantDirectory(portalScope, nowIso) : [];
  const depositTenants = canManageDeposits ? tenantDirectory(depositScope, nowIso) : [];
  const requestedTenantId = Number(query?.tenant || inviteHandoff?.tenantId || 0);
  const selectedTenantId = portalTenants.some((tenant) => Number(tenant.id) === requestedTenantId) ? requestedTenantId : 0;
  const submissions = canReviewPayments ? all(
    `SELECT ps.*,p.name property_name,p.currency,t.full_name tenant_name,i.number invoice_number,
      i.amount-i.amount_paid invoice_balance
     FROM payment_submissions ps
     JOIN properties p ON p.id=ps.property_id
     JOIN tenants t ON t.id=ps.tenant_id
     LEFT JOIN invoices i ON i.id=ps.invoice_id
     WHERE ${paymentScope.clause}
     ORDER BY CASE ps.status WHEN 'pending' THEN 0 ELSE 1 END,ps.created_at DESC LIMIT 100`,
    paymentScope.params
  ) : [];
  const deposits = canManageDeposits ? all(
    `SELECT dt.*,p.name property_name,p.currency,l.reference lease_reference,u.name unit_name,t.full_name tenant_name
     FROM deposit_transactions dt
     JOIN properties p ON p.id=dt.property_id
     JOIN leases l ON l.id=dt.lease_id
     JOIN units u ON u.id=l.unit_id
     LEFT JOIN tenants t ON t.id=dt.tenant_id
     WHERE ${depositScope.clause}
     ORDER BY dt.transacted_at DESC,dt.id DESC LIMIT 100`,
    depositScope.params
  ) : [];
  const leases = canManageDeposits ? all(
    `SELECT l.id,l.reference,l.property_id,p.name property_name,p.currency,u.name unit_name,l.deposit,
      COALESCE((SELECT SUM(CASE dt.transaction_type
        WHEN 'received' THEN CAST(ROUND(dt.amount*100) AS INTEGER)
        WHEN 'credit' THEN CAST(ROUND(dt.amount*100) AS INTEGER)
        ELSE -CAST(ROUND(dt.amount*100) AS INTEGER) END)
        FROM deposit_transactions dt WHERE dt.lease_id=l.id),0) held_minor
     FROM leases l JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id
     WHERE ${depositScope.clause} AND l.status='active' ORDER BY p.name,u.name`,
    depositScope.params
  ) : [];
  const pending = submissions.filter((item) => item.status === "pending");
  const activeAccounts = portalTenants.filter((item) => item.portal_status === "active").length;
  const invitedAccounts = portalTenants.filter((item) => item.portal_status === "invited" && item.invite_active).length;
  const depositGroups = [...deposits.reduce((map, row) => {
    const minor = heldSign(row.transaction_type) * toMinorUnits(row.amount, "Deposit transaction amount");
    map.set(row.currency, (map.get(row.currency) || 0) + minor);
    return map;
  }, new Map()).entries()];
  const depositMetric = depositGroups.length === 0
    ? money(0)
    : depositGroups.length === 1
      ? money(fromMinorUnits(depositGroups[0][1]), depositGroups[0][0])
      : `${depositGroups.length} currencies`;
  const invitedTenant = inviteHandoff ? portalTenants.find((item) => Number(item.id) === inviteHandoff.tenantId) : null;
  const appUrl = configuredPublicUrl() || "http://localhost:3000";
  const inviteUrl = invitedTenant && inviteHandoff ? `${appUrl}/portal/activate/${inviteHandoff.token}` : null;
  const phone = invitedTenant?.phone?.replace(/\D/g, "");
  const shareText = invitedTenant && inviteUrl ? `Hello ${invitedTenant.full_name}, your secure ${invitedTenant.property_name} resident portal is ready. Use this one-time link within 7 days to set your password: ${inviteUrl}` : "";
  const whatsappUrl = phone && shareText ? `https://wa.me/${phone}?text=${encodeURIComponent(shareText)}` : null;
  const methods = [...extensions.paymentMethods.values()];

  return <>
    <Flash searchParams={query}/>
    <PageHeader
      eyebrow="Resident self-service"
      title="Tenant portal"
      description="Manage only the resident-access, payment-review, and deposit responsibilities assigned to your account."
      actions={<>
        {canViewPeople && <Link href="/tenants" className="button secondary"><Icon name="tenant" size={17}/>Tenant profiles</Link>}
        {canManageDeposits && leases.length > 0 && <OpenModalButton target="deposit-modal" icon="deposit">Record deposit</OpenModalButton>}
      </>}
    />
    <PortalAccessSection
      user={user}
      canManageAccess={canManageAccess}
      canReviewPayments={canReviewPayments}
      canManageDeposits={canManageDeposits}
      inviteUrl={inviteUrl}
      invitedTenant={invitedTenant}
      whatsappUrl={whatsappUrl}
      activeAccounts={activeAccounts}
      invitedAccounts={invitedAccounts}
      pendingCount={pending.length}
      depositMetric={depositMetric}
      portalTenants={portalTenants}
      selectedTenantId={selectedTenantId}
    />
    <PortalPaymentSection canReviewPayments={canReviewPayments} pending={pending} submissions={submissions}/>
    <PortalDepositSection canManageDeposits={canManageDeposits} deposits={deposits} leases={leases} depositTenants={depositTenants} methods={methods}/>
  </>;
}
