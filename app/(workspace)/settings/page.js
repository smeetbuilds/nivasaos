import { updateSettingsAction, changePasswordAction } from "@/app/actions";
import { all } from "@/lib/db";
import { extensions } from "@/lib/extensions";
import { requirePortfolioPermission } from "@/lib/permissions";
import PageHeader from "@/components/PageHeader";
import Flash from "@/components/Flash";
import ActionButton from "@/components/ActionButton";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }) {
  const user = await requirePortfolioPermission("settings.manage");
  const rows = all("SELECT key,value FROM settings");
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const query = await searchParams;
  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Workspace configuration" title="Settings" description="System-wide defaults are deliberately small; extensions can register additional settings sections."/>
    <div className="settings-layout">
      <form action={updateSettingsAction} className="panel settings-form"><div className="panel-head"><div><span className="eyebrow">General</span><h2>Organisation defaults</h2></div></div><div className="form-stack"><label><span>Company / portfolio name</span><input name="company_name" defaultValue={settings.company_name || ""}/></label><div className="field-grid two"><label><span>Default currency</span><select name="default_currency" defaultValue={settings.default_currency || "INR"}><option>INR</option><option>USD</option><option>GBP</option><option>EUR</option><option>AED</option><option>AUD</option></select></label><label><span>Timezone</span><input name="timezone" defaultValue={settings.timezone || "Asia/Kolkata"}/></label></div><label><span>WhatsApp rent reminder template</span><textarea name="whatsapp_template" rows="5" defaultValue={settings.whatsapp_template || ""}/><small>Available variables: {"{tenant}"}, {"{invoice}"}, {"{balance}"}, {"{due_date}"}.</small></label><ActionButton pendingLabel="Saving…">Save settings</ActionButton></div></form>
      <aside className="panel extension-panel"><div className="panel-head"><div><span className="eyebrow">Architecture</span><h2>Extension surfaces</h2></div></div><div className="extension-list"><div><strong>Payment methods</strong><span>Add collection methods or gateway adapters.</span></div><div><strong>Notification drivers</strong><span>Replace click-to-chat with WhatsApp Cloud API, email, or SMS.</span></div><div><strong>Dashboard sections</strong><span>Register portfolio-specific cards and operational views.</span></div><div><strong>Settings sections</strong><span>Mount configuration without modifying core screens.</span></div></div><p className="code-hint">Extension entrypoint: <code>plugins/index.js</code></p></aside>
      <form action={changePasswordAction} className="panel settings-form"><div className="panel-head"><div><span className="eyebrow">Security</span><h2>Change your password</h2></div></div><div className="form-stack"><label><span>Current password</span><input type="password" name="currentPassword" autoComplete="current-password" required/></label><label><span>New password</span><input type="password" name="newPassword" minLength="10" autoComplete="new-password" required/></label><label><span>Confirm new password</span><input type="password" name="confirmPassword" minLength="10" autoComplete="new-password" required/></label><ActionButton className="button secondary" pendingLabel="Updating…">Update password</ActionButton></div></form>
    </div>
    {extensions.settingsSections.map((section) => { const Section=section.render; return Section ? <Section key={section.id} user={user} settings={settings}/> : null; })}
  </>;
}
