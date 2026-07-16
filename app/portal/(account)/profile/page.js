import { updateTenantPortalProfileAction } from "@/app/actions";
import { requireTenant } from "@/lib/tenant-auth";
import Flash from "@/components/Flash";
import Icon from "@/components/Icon";

export const metadata = { title: "My profile" };

function maskedIdentity(value) {
  if (!value) return "Not recorded";
  const text = String(value);
  if (text.length <= 4) return text;
  return `${"•".repeat(Math.min(8, text.length - 4))}${text.slice(-4)}`;
}

export default async function PortalProfilePage({ searchParams }) {
  const tenant = await requireTenant();
  const query = await searchParams;
  return <>
    <Flash searchParams={query}/>
    <header className="portal-page-head"><div><span className="eyebrow">Personal details</span><h1>My profile</h1><p>Keep your contact, emergency, and correspondence details current. Identity and account email changes remain controlled by the property team.</p></div></header>

    <section className="portal-profile-grid">
      <article className="portal-card portal-profile-summary"><span className="portal-profile-avatar">{tenant.full_name.slice(0, 1).toUpperCase()}</span><h2>{tenant.full_name}</h2><p>{tenant.property_name}</p><div><span><small>Portal email</small><strong>{tenant.account_email}</strong></span><span><small>Identity number</small><strong>{maskedIdentity(tenant.identity_number)}</strong></span><span><small>Tenant status</small><strong>{tenant.tenant_status}</strong></span></div><p className="portal-profile-note"><Icon name="audit" size={16}/>Sensitive changes are audit logged.</p></article>

      <form action={updateTenantPortalProfileAction} className="portal-card portal-profile-form"><div className="portal-card-head"><div><span className="eyebrow">Editable details</span><h2>Contact information</h2></div></div><div className="portal-form-body"><label><span>Phone with country code</span><input name="phone" defaultValue={tenant.phone} required autoComplete="tel"/></label><label><span>Emergency contact</span><input name="emergencyContact" defaultValue={tenant.emergency_contact || ""} placeholder="Name · phone · relationship"/></label><label><span>Permanent or correspondence address</span><textarea name="address" rows="5" defaultValue={tenant.address || ""}/></label><div className="portal-locked-field"><span><small>Account email</small><strong>{tenant.account_email}</strong></span><Icon name="audit" size={18}/><p>Ask the property team to change this email. Existing portal sessions are revoked when they do.</p></div><button className="button primary">Save profile</button></div></form>
    </section>
  </>;
}
