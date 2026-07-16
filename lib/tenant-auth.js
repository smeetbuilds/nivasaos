import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { get, run } from "@/lib/db";

const COOKIE = "nivasa_tenant_session";
const SESSION_DAYS = 30;

export function hashPortalToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

export async function createTenantSession(accountId) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  run("DELETE FROM tenant_sessions WHERE expires_at <= $now", { now: new Date().toISOString() });
  run(
    "INSERT INTO tenant_sessions (account_id,token_hash,expires_at) VALUES ($accountId,$tokenHash,$expiresAt)",
    { accountId: Number(accountId), tokenHash: hashPortalToken(token), expiresAt: expires.toISOString() }
  );
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/portal",
    expires
  });
}

export async function destroyTenantSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) run("DELETE FROM tenant_sessions WHERE token_hash=$tokenHash", { tokenHash: hashPortalToken(token) });
  store.delete(COOKIE);
}

export async function currentTenantAccount() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  return get(
    `SELECT ta.id account_id,ta.tenant_id,ta.email account_email,ta.status account_status,
      t.full_name,t.email,t.phone,t.identity_number,t.emergency_contact,t.address,t.status tenant_status,
      t.property_id,p.name property_name,p.currency
     FROM tenant_sessions ts
     JOIN tenant_accounts ta ON ta.id=ts.account_id
     JOIN tenants t ON t.id=ta.tenant_id
     JOIN properties p ON p.id=t.property_id
     WHERE ts.token_hash=$tokenHash AND ts.expires_at>$now AND ta.status='active'`,
    { tokenHash: hashPortalToken(token), now: new Date().toISOString() }
  );
}

export async function requireTenant() {
  const tenant = await currentTenantAccount();
  if (!tenant) redirect("/portal/login");
  return tenant;
}

export function portalInvite(token) {
  return get(
    `SELECT ti.id invite_id,ti.account_id,ti.purpose,ti.expires_at,ta.tenant_id,ta.email,ta.status,
      t.full_name,t.phone,p.id property_id,p.name property_name
     FROM tenant_invites ti
     JOIN tenant_accounts ta ON ta.id=ti.account_id
     JOIN tenants t ON t.id=ta.tenant_id
     JOIN properties p ON p.id=t.property_id
     WHERE ti.token_hash=$tokenHash AND ti.consumed_at IS NULL AND ti.expires_at>$now AND ta.status!='disabled'`,
    { tokenHash: hashPortalToken(token), now: new Date().toISOString() }
  );
}

export function portalLease(tenantId, leaseId) {
  return get(
    `SELECT l.*,p.name property_name,p.currency,u.name unit_name,u.unit_type,u.floor
     FROM leases l
     JOIN lease_tenants lt ON lt.lease_id=l.id
     JOIN properties p ON p.id=l.property_id
     JOIN units u ON u.id=l.unit_id
     WHERE l.id=$leaseId AND lt.tenant_id=$tenantId`,
    { leaseId: Number(leaseId), tenantId: Number(tenantId) }
  );
}

export function portalInvoice(tenantId, invoiceId) {
  return get(
    `SELECT i.*,p.name property_name,p.currency,l.reference lease_reference,u.name unit_name
     FROM invoices i
     JOIN properties p ON p.id=i.property_id
     LEFT JOIN leases l ON l.id=i.lease_id
     LEFT JOIN units u ON u.id=l.unit_id
     WHERE i.id=$invoiceId AND (
       i.tenant_id=$tenantId OR
       EXISTS (SELECT 1 FROM lease_tenants lt WHERE lt.lease_id=i.lease_id AND lt.tenant_id=$tenantId)
     )`,
    { invoiceId: Number(invoiceId), tenantId: Number(tenantId) }
  );
}

export function portalTicket(tenantId, ticketId) {
  return get(
    `SELECT mt.*,p.name property_name,u.name unit_name
     FROM maintenance_tickets mt
     JOIN properties p ON p.id=mt.property_id
     LEFT JOIN units u ON u.id=mt.unit_id
     WHERE mt.id=$ticketId AND mt.tenant_id=$tenantId`,
    { ticketId: Number(ticketId), tenantId: Number(tenantId) }
  );
}
