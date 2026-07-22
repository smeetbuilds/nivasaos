import Link from "next/link";
import { activatePortalAccessAction } from "@/app/experience-actions";
import { dateTimeLabel } from "@/lib/format";
import { loadBranding } from "@/lib/branding";
import { portalInvite } from "@/lib/tenant-auth";
import ActionButton from "@/components/ActionButton";
import BrandLogo from "@/components/BrandLogo";
import Icon from "@/components/Icon";
import StatefulForm, { ActionStateMessage } from "@/components/StatefulForm";

export const metadata = { title: "Activate resident portal", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

function AuthCredit({ branding }) {
  return <div className="auth-credit">{branding.whiteLabel ? <>{branding.name} · Self-hosted</> : <>Built by <a href="https://aahavlabs.in">Aahav Labs</a></>}</div>;
}

export default async function ActivatePortalPage({ params }) {
  const { token } = await params;
  const branding = loadBranding();
  const invite = portalInvite(token);
  if (!invite) return <main className="portal-auth-page portal-activation">
    <section className="portal-auth-story" aria-labelledby="invalid-activation-title"><div className="auth-brand"><BrandLogo branding={branding} variant="dark"/></div><div><span className="pill">Secure resident portal</span><h1 id="invalid-activation-title">This activation link is no longer valid.</h1><p>Links are one-time and expire after seven days. Ask the property team to create a new link.</p></div><AuthCredit branding={branding}/></section>
    <section className="portal-auth-panel" aria-labelledby="invalid-activation-panel-title"><div className="portal-auth-form portal-auth-empty"><span className="portal-auth-state-icon"><Icon name="audit" size={32}/></span><h2 id="invalid-activation-panel-title">Link expired or already used</h2><p>No password or account details were changed. A property-team member can generate a fresh activation or reset link.</p><Link href="/portal/login" className="button primary">Go to portal sign in</Link></div></section>
  </main>;

  return <main className="portal-auth-page portal-activation">
    <section className="portal-auth-story" aria-labelledby="activation-story-title"><div className="auth-brand"><BrandLogo branding={branding} variant="dark"/></div><div><span className="pill">One-time secure setup</span><h1 id="activation-story-title">Welcome, {invite.full_name}.</h1><p>Create a password for your private {invite.property_name} portal. This link stops working immediately after setup.</p></div><div className="portal-invite-meta" aria-label="Portal invitation details"><span><small>Account email</small><strong>{invite.email}</strong></span><span><small>Property</small><strong>{invite.property_name}</strong></span><span><small>Link expiry</small><strong>{dateTimeLabel(invite.expires_at)}</strong></span></div><AuthCredit branding={branding}/></section>
    <section className="portal-auth-panel" aria-labelledby="activation-form-title"><div className="portal-auth-form"><span className="step-label">{invite.purpose === "reset" ? "Reset portal password" : "Activate portal access"}</span><h2 id="activation-form-title">Create a secure password</h2><p>The property team cannot see your password. Activating this link signs out any older portal session.</p><StatefulForm action={activatePortalAccessAction} className="form-stack portal-activation-form"><ActionStateMessage/><input type="hidden" name="token" value={token}/><label><span>New password</span><input type="password" name="password" minLength="10" maxLength="256" required autoComplete="new-password" aria-describedby="portal-password-rules"/></label><label><span>Confirm password</span><input type="password" name="confirmPassword" minLength="10" maxLength="256" required autoComplete="new-password" aria-describedby="portal-password-rules"/></label><div id="portal-password-rules" className="password-requirements"><Icon name="audit" size={16}/><span><strong>Password requirements</strong><small>Use 10–256 characters and store the password in a password manager.</small></span></div><ActionButton className="button primary large" pendingLabel="Securing portal…">Secure my portal <Icon name="arrow" size={18}/></ActionButton></StatefulForm><Link href="/portal/login" className="text-link">Already activated? Sign in</Link></div></section>
  </main>;
}
