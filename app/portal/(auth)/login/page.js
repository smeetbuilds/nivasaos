import Link from "next/link";
import { redirect } from "next/navigation";
import { tenantLoginAction } from "@/app/actions";
import { loadBranding } from "@/lib/branding";
import { currentTenantAccount } from "@/lib/tenant-auth";
import ActionButton from "@/components/ActionButton";
import BrandLogo from "@/components/BrandLogo";
import Icon from "@/components/Icon";

export const metadata = { title: "Resident portal sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function TenantLoginPage({ searchParams }) {
  if (await currentTenantAccount()) redirect("/portal");
  const branding = loadBranding();
  const query = await searchParams;
  return <main className="portal-auth-page">
    <section className="portal-auth-story" aria-labelledby="resident-signin-story-title"><div className="auth-brand"><BrandLogo branding={branding} variant="dark"/></div><div><span className="pill">Private resident access</span><h1 id="resident-signin-story-title">Your home, payments, deposits, and requests in one secure place.</h1><p>See the records your property team maintains for you without calling for every receipt or balance update.</p></div><div className="portal-trust-list"><span><Icon name="audit" size={17}/>Private tenant-scoped access</span><span><Icon name="receipt" size={17}/>Receipts and payment history</span><span><Icon name="maintenance" size={17}/>Maintenance progress updates</span></div><div className="auth-credit">{branding.whiteLabel ? <>{branding.name} · Self-hosted</> : <>Built by <a href="https://aahavlabs.in">Aahav Labs</a></>}</div></section>
    <section className="portal-auth-panel" aria-labelledby="resident-signin-title"><div className="portal-auth-form"><span className="step-label">Resident portal</span><h2 id="resident-signin-title">Sign in</h2><p>Use the email address linked to your resident or business-tenant profile.</p>{query?.error && <div className="flash flash-error auth-error" role="alert" aria-live="assertive">{query.error}</div>}<form action={tenantLoginAction} className="form-stack auth-credential-form"><label><span>Email address</span><input type="email" name="email" required maxLength="254" autoComplete="email" autoCapitalize="none" spellCheck="false" inputMode="email"/></label><label><span>Password</span><input type="password" name="password" required maxLength="256" autoComplete="current-password" aria-describedby="resident-password-help"/><small id="resident-password-help">Your account is private and sign-in attempts are rate limited.</small></label><ActionButton className="button primary large" pendingLabel="Signing in…">Sign in <Icon name="arrow" size={18}/></ActionButton></form><p className="portal-auth-help">First visit? Ask your property team for a one-time activation link.</p><div className="auth-route-switch"><span>Owner or property-team member?</span><Link href="/login" className="text-link">Open staff sign in</Link></div></div></section>
  </main>;
}
