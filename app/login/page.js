import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { currentUser, isInstalled } from "@/lib/auth";
import { loadBranding } from "@/lib/branding";
import ActionButton from "@/components/ActionButton";
import BrandLogo from "@/components/BrandLogo";
import Icon from "@/components/Icon";

export const metadata = { title: "Sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }) {
  if (!isInstalled()) redirect("/install");
  if (await currentUser()) redirect("/dashboard");
  const branding = loadBranding();
  const query = await searchParams;
  return <main className="auth-page compact-auth">
    <section className="auth-story" aria-labelledby="staff-signin-story-title">
      <div className="auth-brand"><BrandLogo branding={branding} variant="dark"/></div>
      <div className="story-copy"><span className="pill">{branding.tagline}</span><h1 id="staff-signin-story-title">Everything from vacancy to collection, in one place.</h1><p>A focused workspace for owners and property teams who need governed access without enterprise software overhead.</p></div>
      <div className="auth-trust-list" aria-label="Workspace security summary"><span><Icon name="audit" size={17}/>Permission-scoped access</span><span><Icon name="modules" size={17}/>Module-aware operations</span><span><Icon name="report" size={17}/>Auditable activity</span></div>
      <div className="auth-credit">{branding.whiteLabel ? <>{branding.name} · Self-hosted</> : <>Built by <a href="https://aahavlabs.in">Aahav Labs</a></>}</div>
    </section>
    <section className="auth-panel" aria-labelledby="staff-signin-title"><div className="auth-form-wrap login-wrap"><div className="step-label">Welcome back</div><h2 id="staff-signin-title">Sign in to your workspace</h2><p>Use the owner, admin, or staff account created for you.</p>
      {query?.error && <div className="flash flash-error auth-error" role="alert" aria-live="assertive">{query.error}</div>}
      <form action={loginAction} className="form-stack auth-credential-form"><label><span>Email address</span><input type="email" name="email" required maxLength="254" autoComplete="email" autoCapitalize="none" spellCheck="false" inputMode="email"/></label><label><span>Password</span><input type="password" name="password" required maxLength="256" autoComplete="current-password" aria-describedby="staff-password-help"/><small id="staff-password-help">Sign-in attempts are rate limited and recorded for security.</small></label><ActionButton className="button primary large" pendingLabel="Signing in…">Sign in <Icon name="arrow" size={18}/></ActionButton></form>
      <div className="auth-route-switch"><span>Resident or business tenant?</span><Link href="/portal/login" className="text-link">Open resident portal</Link></div>
    </div></section>
  </main>;
}
