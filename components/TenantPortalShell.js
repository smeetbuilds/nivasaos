"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { tenantLogoutAction } from "@/app/actions";
import Icon from "@/components/Icon";

function activeRoute(pathname, href) {
  return href === "/portal" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export default function TenantPortalShell({ tenant, company, module, children }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const nav = [
    ["/portal", "home", "Home"],
    ["/portal/lease", module.id === "commercial" ? "commercial" : "lease", module.id === "commercial" ? "My premises" : "My home"],
    ["/portal/billing", "receipt", "Billing"],
    ["/portal/requests", "portal", "Requests"],
    ...(module.capabilities.includes("servicePlans") ? [["/portal/services", "services", "Services"]] : []),
    ...(module.capabilities.includes("visitorRegister") ? [["/portal/visitors", "visitors", "Visitors"]] : []),
    ["/portal/maintenance", "maintenance", "Maintenance"],
    ["/portal/profile", "profile", "Profile"]
  ];
  const current = nav.find(([href]) => activeRoute(pathname, href)) || nav[0];
  const primaryHrefs = ["/portal", "/portal/billing", "/portal/requests", "/portal/maintenance"];
  const primary = primaryHrefs.map((href) => nav.find((item) => item[0] === href)).filter(Boolean);
  const secondary = nav.filter((item) => !primaryHrefs.includes(item[0]));
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    document.body.classList.toggle("portal-more-open", moreOpen);
    const escape = (event) => { if (event.key === "Escape") setMoreOpen(false); };
    window.addEventListener("keydown", escape);
    return () => { document.body.classList.remove("portal-more-open"); window.removeEventListener("keydown", escape); };
  }, [moreOpen]);

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
    <button type="button" className={`portal-more-scrim${moreOpen ? " is-open" : ""}`} aria-label="Close portal menu" onClick={() => setMoreOpen(false)}/>
    <section className={`portal-more-sheet${moreOpen ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-hidden={!moreOpen} inert={!moreOpen} aria-label="More portal options">
      <div className="portal-more-handle"/><div className="portal-more-head"><span><small>{module.shortLabel}</small><strong>More options</strong></span><button type="button" className="icon-button" aria-label="Close" onClick={() => setMoreOpen(false)}><Icon name="close" size={20}/></button></div>
      <div className="portal-more-grid">{secondary.map(([href,icon,label]) => <Link href={href} key={href} className={activeRoute(pathname,href)?"is-active":""}><span><Icon name={icon} size={21}/></span><strong>{label}</strong></Link>)}</div>
      <form action={tenantLogoutAction}><button className="button secondary portal-more-logout"><Icon name="logout" size={17}/>Sign out</button></form>
    </section>
    <nav className="tenant-portal-bottom-nav module-bottom-nav" aria-label="Tenant portal quick navigation">{primary.map(([href, icon, label]) => { const active = activeRoute(pathname, href); return <Link href={href} key={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={icon} size={20}/><span>{label}</span></Link>; })}<button type="button" className={moreOpen || secondary.some(([href])=>activeRoute(pathname,href)) ? "is-active" : ""} onClick={() => setMoreOpen(true)} aria-expanded={moreOpen}><Icon name="more" size={20}/><span>More</span></button></nav>
  </div>;
}
