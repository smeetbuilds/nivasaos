import Link from "next/link";
import { activateTenantPortalAction } from "@/app/actions";
import { portalInvite } from "@/lib/tenant-auth";
import { dateTimeLabel } from "@/lib/format";
import Icon from "@/components/Icon";

export const metadata = { title: "Activate resident portal", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ActivatePortalPage({ params }) {
  const { token } = await params;
  const invite = portalInvite(token);
  if (!invite) return <main className="portal-auth-page portal-activation"><section className="portal-auth-story"><div className="auth-brand"><span className="brand-mark"><Icon name="building" size={24}/></span>NivasaOS</div><div><span className="pill">Secure resident portal</span><h1>This activation link is no longer valid.</h1><p>Links are one-time and expire after seven days. Ask the property team to create a new link.</p></div></section><section className="portal-auth-panel"><div className="portal-auth-form"><Icon name="audit" size={38}/><h2>Link expired or already used</h2><p>No password or account details were changed.</p><Link href="/portal/login" className="button primary">Go to portal sign in</Link></div></section></main>;
  return <main className="portal-auth-page portal-activation"><section className="portal-auth-story"><div className="auth-brand"><span className="brand-mark"><Icon name="building" size={24}/></span>NivasaOS</div><div><span className="pill">One-time secure setup</span><h1>Welcome, {invite.full_name}.</h1><p>Create a password for your private {invite.property_name} resident portal. This link stops working immediately after setup.</p></div><div className="portal-invite-meta"><span><small>Account email</small><strong>{invite.email}</strong></span><span><small>Link expiry</small><strong>{dateTimeLabel(invite.expires_at)}</strong></span></div></section><section className="portal-auth-panel"><div className="portal-auth-form"><span className="step-label">{invite.purpose === "reset" ? "Reset portal password" : "Activate portal access"}</span><h2>Create a secure password</h2><p>Use at least 10 characters. The property team cannot see this password.</p><form action={activateTenantPortalAction} className="form-stack"><input type="hidden" name="token" value={token}/><label><span>New password</span><input type="password" name="password" minLength="10" required autoComplete="new-password"/></label><label><span>Confirm password</span><input type="password" name="confirmPassword" minLength="10" required autoComplete="new-password"/></label><button className="button primary large">Secure my portal <Icon name="arrow" size={18}/></button></form><Link href="/portal/login" className="text-link">Already activated? Sign in</Link></div></section></main>;
}
