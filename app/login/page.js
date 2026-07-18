import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { currentUser, isInstalled } from "@/lib/auth";
import { loadBranding } from "@/lib/branding";
import BrandLogo from "@/components/BrandLogo";
import Icon from "@/components/Icon";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }) {
  if (!isInstalled()) redirect("/install");
  if (await currentUser()) redirect("/dashboard");
  const branding = loadBranding();
  const query = await searchParams;
  return <main className="auth-page compact-auth">
    <section className="auth-story">
      <div className="auth-brand"><BrandLogo branding={branding} variant="dark"/></div>
      <div className="story-copy"><span className="pill">{branding.tagline}</span><h1>Everything from vacancy to collection, in one place.</h1><p>A focused workspace for owners and property teams who need control without enterprise software overhead.</p></div>
      <div className="auth-credit">{branding.whiteLabel ? <>{branding.name} · Self-hosted</> : <>Built by <a href="https://aahavlabs.in">Aahav Labs</a></>}</div>
    </section>
    <section className="auth-panel"><div className="auth-form-wrap login-wrap"><div className="step-label">Welcome back</div><h2>Sign in to your workspace</h2><p>Use the owner, admin, or staff account created for you.</p>
      {query?.error && <div className="flash flash-error">{query.error}</div>}
      <form action={loginAction} className="form-stack"><label><span>Email address</span><input type="email" name="email" required autoComplete="email"/></label><label><span>Password</span><input type="password" name="password" required autoComplete="current-password"/></label><button className="button primary large" type="submit">Sign in <Icon name="arrow" size={18}/></button></form>
    </div></section>
  </main>;
}
