"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tenantLogoutAction } from "@/app/actions";
import Icon from "@/components/Icon";

function activeRoute(pathname, href) {
  return href === "/portal" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export default function TenantPortalShell({ tenant, company, module, children }) {
  const pathname = usePathname();
  const nav = [
    ["/portal", "home", "Home"],
    ["/portal/lease", module.id === "commercial" ? "commercial" : "lease", module.id === "commercial" ? "My premises" : "My home"],
    ["/portal/billing", "receipt", "Billing"],
    ...(module.capabilities.includes("servicePlans") ? [["/portal/services", "services", "Services"]] : []),
    ...(module.capabilities.includes("visitorRegister") ? [["/portal/visitors", "visitors", "Visitors"]] : []),
    ["/portal/maintenance", "maintenance", "Maintenance"],
    ["/portal/profile", "profile", "Profile"]
  ];
  const current = nav.find(([href]) => activeRoute(pathname, href)) || nav[0];
  return <div className={`tenant-portal-shell module-${module.id}`}>
    <aside className="tenant-portal-sidebar">
      <Link href="/portal" className="portal-brand"><span className="portal-brand-mark"><Icon name={module.icon} size={22}/></span><span><strong>{company}</strong><small>{module.terminology.portal}</small></span></Link>
      <div className="portal-module-chip"><Icon name={module.icon} size={15}/><span>{module.shortLabel}</span></div>
      <div className="portal-resident-card"><span className="avatar">{tenant.full_name.slice(0, 1).toUpperCase()}</span><span><strong>{tenant.full_name}</strong><small>{tenant.property_name} · {module.terminology.occupant}</small></span></div>
      <nav aria-label="Tenant portal navigation">{nav.map(([href, icon, label]) => { const active = activeRoute(pathname, href); return <Link href={href} key={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={icon} size={19}/><span>{label}</span></Link>; })}</nav>
      <form action={tenantLogoutAction} className="portal-logout"><button className="button secondary"><Icon name="logout" size={17}/>Sign out</button></form>
    </aside>
    <div className="tenant-portal-workspace">
      <header className="tenant-portal-topbar"><div><span className="eyebrow">{module.terminology.portal}</span><strong>{current[2]}</strong></div><span className="portal-top-user"><span className="avatar avatar-small">{tenant.full_name.slice(0, 1).toUpperCase()}</span><span><strong>{tenant.full_name}</strong><small>{tenant.property_name}</small></span></span></header>
      <main className="tenant-portal-content">{children}</main>
      <footer className="tenant-portal-footer">Powered by NivasaOS · {module.label} · Built by <a href="https://aahavlabs.in" target="_blank" rel="noreferrer">Aahav Labs</a></footer>
    </div>
    <nav className="tenant-portal-bottom-nav module-bottom-nav" aria-label="Tenant portal quick navigation">{nav.map(([href, icon, label]) => { const active = activeRoute(pathname, href); return <Link href={href} key={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={icon} size={20}/><span>{label}</span></Link>; })}</nav>
  </div>;
}
