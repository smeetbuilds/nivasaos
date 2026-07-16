import { redirect } from "next/navigation";
import { installAction } from "@/app/actions";
import { isInstalled } from "@/lib/auth";
import Icon from "@/components/Icon";

export const metadata = { title: "Install" };
export const dynamic = "force-dynamic";

export default function InstallPage() {
  if (isInstalled()) redirect("/login");
  return <main className="auth-page">
    <section className="auth-story">
      <div className="auth-brand"><span className="brand-mark"><Icon name="building" size={24}/></span>NivasaOS</div>
      <div className="story-copy"><span className="pill">Private by default · Runs on your server</span><h1>Rental operations without the spreadsheet chaos.</h1><p>Set up the first owner account, then manage properties, occupants, rent, proofs, reminders, and maintenance from one calm workspace.</p></div>
      <div className="story-grid"><div><strong>Local SQLite</strong><span>No hosted database account</span></div><div><strong>Role-scoped</strong><span>Owner, admin, and staff access</span></div><div><strong>Extension-ready</strong><span>Add drivers without rewriting core</span></div></div>
      <div className="auth-credit">Built by <a href="https://aahavlabs.in">Aahav Labs</a></div>
    </section>
    <section className="auth-panel"><div className="auth-form-wrap"><div className="step-label">First-run installer</div><h2>Create your workspace</h2><p>This account becomes the system owner. You can invite staff after installation.</p>
      <form action={installAction} className="form-stack">
        <div className="field-grid two"><label><span>Owner name</span><input name="name" required autoComplete="name" placeholder="Smeet Ghori"/></label><label><span>Company / portfolio name</span><input name="company" required placeholder="Your Rentals"/></label></div>
        <label><span>Email address</span><input type="email" name="email" required autoComplete="email" placeholder="owner@example.com"/></label>
        <label><span>Password</span><input type="password" name="password" required minLength="10" autoComplete="new-password" placeholder="At least 10 characters"/><small>Use a unique password with 10 or more characters.</small></label>
        <label><span>Default currency</span><select name="currency" defaultValue="INR"><option>INR</option><option>USD</option><option>GBP</option><option>EUR</option><option>AED</option><option>AUD</option><option>CAD</option><option>SGD</option></select></label>
        <label className="check-row"><input type="checkbox" name="demo"/><span><strong>Add two sample units</strong><small>Useful for quickly exploring the interface. No sample tenant or financial data is created.</small></span></label>
        <button className="button primary large" type="submit">Install NivasaOS <Icon name="arrow" size={18}/></button>
      </form>
    </div></section>
  </main>;
}
