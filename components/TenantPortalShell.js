"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tenantLogoutAction } from "@/app/actions";
import Icon from "@/components/Icon";

const nav = [
  ["/portal", "home", "Home"],
  ["/portal/lease", "lease", "My home"],
  ["/portal/billing", "receipt", "Billing"],
  ["/portal/maintenance", "maintenance", "Maintenance"],
  ["/portal/profile", "profile", "Profile"]
];

function activeRoute(pathname, href) {
  return href === "/portal" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export default function TenantPortalShell({ tenant, company, children }) {
  const pathname = usePathname();
  const current = nav.find(([href]) => activeRoute(pathname, href)) || nav[0];
  return <div className="tenant-portal-shell">
    <aside className="tenant-portal-sidebar">
      <Link href="/portal" className="portal-brand"><span className="portal-brand-mark"><Icon name="building" size={22}/></span><span><strong>{company}</strong><small>Resident portal</small></span></Link>
      <div className="portal-resident-card"><span className="avatar">{tenant.full_name.slice(0, 1).toUpperCase()}</span><span><strong>{tenant.full_name}</strong><small>{tenant.property_name}</small></span></div>
      <nav aria-label="Tenant portal navigation">{nav.map(([href, icon, label]) => { const active = activeRoute(pathname, href); return <Link href={href} key={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={icon} size={19}/><span>{label}</span></Link>; })}</nav>
      <form action={tenantLogoutAction} className="portal-logout"><button className="button secondary"><Icon name="logout" size={17}/>Sign out</button></form>
    </aside>
    <div className="tenant-portal-workspace">
      <header className="tenant-portal-topbar"><div><span className="eyebrow">Resident portal</span><strong>{current[2]}</strong></div><span className="portal-top-user"><span className="avatar avatar-small">{tenant.full_name.slice(0, 1).toUpperCase()}</span><span><strong>{tenant.full_name}</strong><small>{tenant.property_name}</small></span></span></header>
      <main className="tenant-portal-content">{children}</main>
      <footer className="tenant-portal-footer">Powered by NivasaOS · Built by <a href="https://aahavlabs.in" target="_blank" rel="noreferrer">Aahav Labs</a></footer>
    </div>
    <nav className="tenant-portal-bottom-nav" aria-label="Tenant portal quick navigation">{nav.map(([href, icon, label]) => { const active = activeRoute(pathname, href); return <Link href={href} key={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={icon} size={20}/><span>{label}</span></Link>; })}</nav>
  </div>;
}
