import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, requireUser, verifyPasswordOrDummy } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { changedFields, recordAudit } from "@/lib/audit";
import { assertPermission } from "@/lib/permission-core";
import { integer, passwordInput, safeRedirect, text } from "@/lib/actions/shared";
import { createTenantSession, destroyTenantSession, hashPortalToken, portalInvite, requireTenant } from "@/lib/tenant-auth";
import { limitedText, refreshPortalViews, validEmail, validPhone } from "@/lib/actions/portal-common";
import { clearAccountThrottle, loginThrottleContext, recordAuthFailure, throttleRetryAfter } from "@/lib/auth-rate-limit";
import { encodePortalInviteHandoff, PORTAL_HANDOFF_COOKIE, portalHandoffCookieOptions } from "@/lib/portal-handoff";

export async function createTenantInviteAction(formData) {
  const actor = await requireUser();
  const tenantId = integer(formData, "tenantId");
  const tenant = get("SELECT * FROM tenants WHERE id=$tenantId", { tenantId });
  if (!tenant) throw new Error("Tenant not found");
  assertPermission(actor, "portal.manage", tenant.property_id);
  const email = validEmail(tenant.email);
  const conflict = get("SELECT tenant_id FROM tenant_accounts WHERE email=$email AND tenant_id!=$tenantId", { email, tenantId });
  if (conflict) throw new Error("This email already belongs to another tenant portal account");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashPortalToken(token);
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  transaction(() => {
    let account = get("SELECT * FROM tenant_accounts WHERE tenant_id=$tenantId", { tenantId });
    if (!account) {
      const result = run(
        `INSERT INTO tenant_accounts (tenant_id,email,status,invited_at)
         VALUES ($tenantId,$email,'invited',CURRENT_TIMESTAMP)`,
        { tenantId, email }
      );
      account = { id: Number(result.lastInsertRowid), password_hash: null, status: "invited" };
    } else {
      run(
        `UPDATE tenant_accounts SET email=$email,status=CASE WHEN status='disabled' THEN 'invited' ELSE status END,
         invited_at=CURRENT_TIMESTAMP,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$accountId`,
        { email, accountId: account.id }
      );
    }
    run("DELETE FROM tenant_invites WHERE account_id=$accountId AND consumed_at IS NULL", { accountId: account.id });
    if (account.password_hash) run("DELETE FROM tenant_sessions WHERE account_id=$accountId", { accountId: account.id });
    run(
      `INSERT INTO tenant_invites (account_id,token_hash,purpose,expires_at,created_by)
       VALUES ($accountId,$tokenHash,$purpose,$expiresAt,$actorId)`,
      { accountId: account.id, tokenHash, purpose: account.password_hash ? "reset" : "activate", expiresAt, actorId: actor.id }
    );
    recordAudit({ actor, action: account.password_hash ? "security" : "enable", entityType: "tenant_portal", entityId: tenantId, propertyId: tenant.property_id, summary: `${account.password_hash ? "Created password reset" : "Invited tenant"} ${tenant.full_name} to the portal`, metadata: { expiresInDays: 7 } });
  });

  const store = await cookies();
  store.set(PORTAL_HANDOFF_COOKIE, encodePortalInviteHandoff({ token, tenantId }), portalHandoffCookieOptions());
  refreshPortalViews();
  redirect(`/tenant-portal?success=${encodeURIComponent("Portal link created. Share it securely with the tenant.")}&tenant=${tenantId}`);
}

export async function disableTenantPortalAction(formData) {
  const actor = await requireUser();
  const tenantId = integer(formData, "tenantId");
  const tenant = get("SELECT * FROM tenants WHERE id=$tenantId", { tenantId });
  if (!tenant) throw new Error("Tenant not found");
  assertPermission(actor, "portal.manage", tenant.property_id);
  const account = get("SELECT id,status FROM tenant_accounts WHERE tenant_id=$tenantId", { tenantId });
  if (!account) safeRedirect("/tenant-portal", "Tenant portal is not enabled");
  transaction(() => {
    run("UPDATE tenant_accounts SET status='disabled',failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$accountId", { accountId: account.id });
    run("DELETE FROM tenant_sessions WHERE account_id=$accountId", { accountId: account.id });
    run("DELETE FROM tenant_invites WHERE account_id=$accountId AND consumed_at IS NULL", { accountId: account.id });
    recordAudit({ actor, action: "disable", entityType: "tenant_portal", entityId: tenantId, propertyId: tenant.property_id, summary: `Disabled portal access for ${tenant.full_name}` });
  });
  const store = await cookies();
  store.set(PORTAL_HANDOFF_COOKIE, "", { ...portalHandoffCookieOptions(), maxAge: 0 });
  refreshPortalViews();
  safeRedirect("/tenant-portal", "Tenant portal access disabled");
}

export async function activateTenantPortalAction(formData) {
  const token = text(formData, "token", true);
  const password = passwordInput(formData, "password");
  const confirmation = passwordInput(formData, "confirmPassword");
  if (password.length < 10) throw new Error("Password must be at least 10 characters");
  if (password !== confirmation) throw new Error("Passwords do not match");
  const invite = portalInvite(token);
  if (!invite) redirect("/portal/login?error=This%20portal%20link%20is%20invalid%20or%20has%20expired");

  transaction(() => {
    const consumed = run(
      "UPDATE tenant_invites SET consumed_at=CURRENT_TIMESTAMP WHERE id=$inviteId AND consumed_at IS NULL AND expires_at>$now",
      { inviteId: invite.invite_id, now: new Date().toISOString() }
    );
    if (Number(consumed.changes) !== 1) throw new Error("This portal link was already used or expired");
    run(
      `UPDATE tenant_accounts SET password_hash=$passwordHash,status='active',failed_attempts=0,locked_until=NULL,
       activated_at=COALESCE(activated_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=$accountId`,
      { passwordHash: hashPassword(password), accountId: invite.account_id }
    );
    run("DELETE FROM tenant_sessions WHERE account_id=$accountId", { accountId: invite.account_id });
    recordAudit({ tenantActor: { tenantId: invite.tenant_id }, action: "security", entityType: "tenant_portal", entityId: invite.tenant_id, propertyId: invite.property_id, summary: `${invite.full_name} ${invite.purpose === "reset" ? "reset" : "activated"} portal access` });
  });
  await createTenantSession(invite.account_id);
  redirect("/portal?welcome=1");
}

export async function tenantLoginAction(formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 254);
  const password = passwordInput(formData, "password");
  const throttle = await loginThrottleContext("tenant", email);
  const retryAfter = throttleRetryAfter(throttle);
  const account = get("SELECT * FROM tenant_accounts WHERE email=$email", { email });
  const legacyLockUntil = account?.locked_until ? new Date(account.locked_until).getTime() : 0;
  const legacyLocked = Number.isFinite(legacyLockUntil) && legacyLockUntil > Date.now();
  const passwordValid = retryAfter === 0 && !legacyLocked ? verifyPasswordOrDummy(password, account?.password_hash) : false;
  const valid = retryAfter === 0 && !legacyLocked && Boolean(account && account.status === "active" && passwordValid);
  if (!valid) {
    if (retryAfter === 0 && !legacyLocked) recordAuthFailure(throttle);
    if (account?.status === "active" && !legacyLocked) {
      run("UPDATE tenant_accounts SET failed_attempts=failed_attempts+1,locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$accountId", { accountId: account.id });
    }
    const message = retryAfter > 0 || legacyLocked ? "Sign in is temporarily unavailable. Try again later" : "Invalid email or password";
    redirect(`/portal/login?error=${encodeURIComponent(message)}`);
  }
  clearAccountThrottle(throttle);
  run("UPDATE tenant_accounts SET failed_attempts=0,locked_until=NULL,last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$accountId", { accountId: account.id });
  await createTenantSession(account.id);
  redirect("/portal");
}

export async function tenantLogoutAction() {
  await destroyTenantSession();
  redirect("/portal/login");
}

export async function updateTenantPortalProfileAction(formData) {
  const tenant = await requireTenant();
  const before = get("SELECT * FROM tenants WHERE id=$tenantId", { tenantId: tenant.tenant_id });
  const after = {
    phone: validPhone(formData),
    emergency_contact: limitedText(formData, "emergencyContact", 180),
    address: limitedText(formData, "address", 1200)
  };
  const fields = changedFields(before, after, ["phone", "emergency_contact", "address"]);
  if (!fields.length) safeRedirect("/portal/profile", "No profile changes detected");
  transaction(() => {
    run("UPDATE tenants SET phone=$phone,emergency_contact=$emergency_contact,address=$address,updated_at=CURRENT_TIMESTAMP WHERE id=$tenantId", { ...after, tenantId: tenant.tenant_id });
    recordAudit({ tenantActor: tenant, action: "update", entityType: "tenant_profile", entityId: tenant.tenant_id, propertyId: tenant.property_id, summary: `${tenant.full_name} updated portal profile`, metadata: { fields } });
  });
  refreshPortalViews();
  safeRedirect("/portal/profile", "Profile updated");
}
