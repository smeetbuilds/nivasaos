import Link from "next/link";
import { redirect } from "next/navigation";
import { tenantLoginAction } from "@/app/actions";
import { currentTenantAccount } from "@/lib/tenant-auth";
import Icon from "@/components/Icon";

export const metadata = { title: "Resident portal sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function TenantLoginPage({ searchParams }) {
  if (await currentTenantAccount()) redirect("/portal");
  const query = await searchParams;
  return <main className="portal-auth-page">
    <section className="portal-auth-story"><div className="auth-brand"><span className="brand-mark"><Icon name="building" size={24}/></span>NivasaOS</div><div><span className="pill">Private resident access</span><h1>Your home, payments, deposits, and requests in one secure place.</h1><p>See the records your property team maintains for you without calling for every receipt or balance update.</p></div><div className="portal-trust-list"><span><Icon name="audit" size={17}/>Private tenant-scoped access</span><span><Icon name="receipt" size={17}/>Receipts and payment history</span><span><Icon name="maintenance" size={17}/>Maintenance progress updates</span></div><div className="auth-credit">Built by <a href="https://aahavlabs.in">Aahav Labs</a></div></section>
    <section className="portal-auth-panel"><div className="portal-auth-form"><span className="step-label">Resident portal</span><h2>Sign in</h2><p>Use the email address linked to your tenant profile.</p>{query?.error && <div className="flash flash-error">{query.error}</div>}<form action={tenantLoginAction} className="form-stack"><label><span>Email address</span><input type="email" name="email" required autoComplete="email"/></label><label><span>Password</span><input type="password" name="password" required autoComplete="current-password"/></label><button className="button primary large">Sign in <Icon name="arrow" size={18}/></button></form><p className="portal-auth-help">First visit? Ask your property team for a one-time activation link.</p><Link href="/login" className="text-link">Staff and owner sign in</Link></div></section>
  </main>;
}
