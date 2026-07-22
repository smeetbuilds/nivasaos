import { changeWorkspacePasswordAction, updateWorkspaceSettingsAction } from "@/app/experience-actions";
import { all } from "@/lib/db";
import { brandingFromSettings } from "@/lib/branding";
import { extensions } from "@/lib/extensions";
import { requirePortfolioPermission } from "@/lib/permissions";
import ActionButton from "@/components/ActionButton";
import BrandLogo from "@/components/BrandLogo";
import Flash from "@/components/Flash";
import PageHeader from "@/components/PageHeader";
import StatefulForm, { ActionStateMessage } from "@/components/StatefulForm";

export const metadata = { title: "Settings" };
const currencies = ["USD", "EUR", "GBP", "INR", "AED", "AUD", "CAD", "SGD"];

function BrandAssetField({ label, name, active, help, favicon = false }) {
  const accept = favicon ? "image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico" : "image/png,image/jpeg,image/webp";
  const helpId = `${name}-help`;
  return <div className="brand-asset-field">
    <label htmlFor={name}><span>{label}</span><input id={name} type="file" name={name} accept={accept} aria-describedby={helpId}/><small id={helpId}>{help}</small></label>
    <div className="brand-asset-status"><span className={`brand-asset-indicator${active ? " is-active" : ""}`} aria-hidden="true"/><strong>{active ? "Custom asset active" : "Using bundled default"}</strong></div>
    {active && <label className="brand-remove-option"><input type="checkbox" name={`remove_${name}`}/><span>Remove custom asset and restore the NivasaOS default</span></label>}
  </div>;
}

export default async function SettingsPage({ searchParams }) {
  const user = await requirePortfolioPermission("settings.manage");
  const rows = all("SELECT key,value FROM settings");
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const branding = brandingFromSettings(settings);
  const query = await searchParams;
  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Workspace configuration" title="Settings" description="Control organisation defaults, secure access, integrations, and white-label identity from one governed system surface."/>

    <section className="settings-summary-grid" aria-label="Current workspace settings summary">
      <article><span>Workspace identity</span><strong>{branding.name}</strong><small>{branding.tagline}</small></article>
      <article><span>Regional defaults</span><strong>{settings.default_currency || "USD"} · {settings.timezone || "UTC"}</strong><small>{settings.default_country || "Not specified"}</small></article>
      <article><span>Branding mode</span><strong>{branding.whiteLabel ? "Full white label" : "NivasaOS attribution"}</strong><small>{Object.values(branding.customAssets).filter(Boolean).length} custom asset(s)</small></article>
    </section>

    <div className="settings-layout">
      <StatefulForm action={updateWorkspaceSettingsAction} encType="multipart/form-data" className="panel settings-form settings-general-branding-form" aria-labelledby="organisation-settings-title">
        <div className="panel-head"><div><span className="eyebrow">General</span><h2 id="organisation-settings-title">Organisation defaults</h2></div></div>
        <ActionStateMessage/>
        <div className="form-stack"><label><span>Company / portfolio name</span><input name="company_name" defaultValue={settings.company_name || ""} required maxLength="160" autoComplete="organization"/></label><div className="field-grid three"><label><span>Default country</span><input name="default_country" defaultValue={settings.default_country || "Not specified"} required maxLength="100" autoComplete="country-name"/></label><label><span>Default currency</span><select name="default_currency" defaultValue={settings.default_currency || "USD"}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label><span>Timezone</span><input name="timezone" defaultValue={settings.timezone || "UTC"} required maxLength="100" autoComplete="off" aria-describedby="settings-timezone-help"/><small id="settings-timezone-help">Use an IANA timezone such as Asia/Kolkata or Europe/London.</small></label></div><label><span>WhatsApp rent reminder template</span><textarea name="whatsapp_template" rows="5" maxLength="2000" defaultValue={settings.whatsapp_template || ""} aria-describedby="whatsapp-template-help"/><small id="whatsapp-template-help">Available variables: {"{tenant}"}, {"{invoice}"}, {"{balance}"}, {"{due_date}"}. Maximum 2,000 characters.</small></label></div>

        <div className="settings-section-divider"><span className="eyebrow">White label</span><h2>Brand identity</h2><p>The bundled NivasaOS identity remains the default. Upload transparent PNG, JPG, WebP, or ICO files to replace it without modifying source code.</p></div>
        <div className="form-stack branding-settings-stack">
          <div className="branding-preview-grid" aria-label="Current branding preview"><div className="branding-preview branding-preview-light"><span>Light surface</span><BrandLogo branding={branding} variant="light"/></div><div className="branding-preview branding-preview-dark"><span>Dark surface</span><BrandLogo branding={branding} variant="dark"/></div></div>
          <div className="field-grid two"><label><span>Product / platform name</span><input name="brand_name" defaultValue={settings.brand_name || "NivasaOS"} maxLength="80" required/></label><label><span>Product tagline</span><input name="brand_tagline" defaultValue={settings.brand_tagline || "Property operations"} maxLength="120"/></label></div>
          <label className="check-row white-label-toggle"><input type="checkbox" name="white_label_enabled" defaultChecked={settings.white_label_enabled === "1"}/><span><strong>Enable full white-label mode</strong><small>Use the configured product name in the footer and remove the default Aahav Labs attribution from application, installation, activation, and sign-in surfaces.</small></span></label>
          <div className="brand-assets-grid">
            <BrandAssetField label="Horizontal logo for light surfaces" name="brand_logo_light" active={branding.customAssets.logoLight} help="Recommended transparent image with dark artwork; maximum 2 MB."/>
            <BrandAssetField label="Horizontal logo for dark surfaces" name="brand_logo_dark" active={branding.customAssets.logoDark} help="Recommended transparent image with white or light artwork; maximum 2 MB."/>
            <BrandAssetField label="Symbol for light surfaces" name="brand_symbol_light" active={branding.customAssets.symbolLight} help="Square transparent mark used where a compact identity is required."/>
            <BrandAssetField label="Symbol for dark surfaces" name="brand_symbol_dark" active={branding.customAssets.symbolDark} help="Square light mark for dark navigation and compact surfaces."/>
            <BrandAssetField label="Browser favicon" name="brand_favicon" active={branding.customAssets.favicon} favicon help="Use a square PNG, WebP, JPG, or ICO file; maximum 2 MB."/>
          </div>
          <ActionButton pendingLabel="Saving settings…">Save organisation and branding</ActionButton>
        </div>
      </StatefulForm>

      <aside className="panel extension-panel" aria-labelledby="extension-surfaces-title"><div className="panel-head"><div><span className="eyebrow">Architecture</span><h2 id="extension-surfaces-title">Extension surfaces</h2></div></div><div className="extension-list"><div><strong>Payment methods</strong><span>Add collection methods or gateway adapters.</span></div><div><strong>Notification drivers</strong><span>Replace click-to-chat with WhatsApp Cloud API, email, or SMS.</span></div><div><strong>Dashboard sections</strong><span>Register portfolio-specific cards and operational views.</span></div><div><strong>Settings sections</strong><span>Mount configuration without modifying core screens.</span></div></div><p className="code-hint">Extension entrypoint: <code>plugins/index.js</code></p></aside>

      <StatefulForm action={changeWorkspacePasswordAction} className="panel settings-form settings-security-form" aria-labelledby="password-settings-title"><div className="panel-head"><div><span className="eyebrow">Security</span><h2 id="password-settings-title">Change your password</h2></div></div><ActionStateMessage/><div className="form-stack"><label><span>Current password</span><input type="password" name="currentPassword" maxLength="256" autoComplete="current-password" required/></label><label><span>New password</span><input type="password" name="newPassword" minLength="10" maxLength="256" autoComplete="new-password" required aria-describedby="settings-password-help"/></label><label><span>Confirm new password</span><input type="password" name="confirmPassword" minLength="10" maxLength="256" autoComplete="new-password" required aria-describedby="settings-password-help"/></label><div id="settings-password-help" className="password-requirements"><span><strong>Security requirement</strong><small>Use 10–256 characters. Saving signs out every other active staff session for this account.</small></span></div><ActionButton className="button secondary" pendingLabel="Updating password…">Update password</ActionButton></div></StatefulForm>
    </div>
    {extensions.settingsSections.map((section) => { const Section = section.render; return Section ? <Section key={section.id} user={user} settings={settings}/> : null; })}
  </>;
}
