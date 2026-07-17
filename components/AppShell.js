"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { logoutAction } from "@/app/actions";
import Icon from "@/components/Icon";

function buildNavigation(capabilities, modules) {
  const has = (capability) => capabilities.includes(capability);
  const hasModule = (moduleId) => modules.some((module) => module.id === moduleId);
  return [
    { label: "Workspace", items: [["/dashboard","dashboard","Overview","portfolio.view"],["/modules","modules","Modules","settings.manage"]] },
    { label: "Portfolio", items: [
      ["/properties","property","Properties","portfolio.view"],["/units","unit","Units","portfolio.view"],
      ...(has("spaceInventory") ? [["/spaces","spaces","Beds & spaces","agreements.manage"]] : []),
      ["/tenants","tenant","People","people.manage"],["/leases","lease","Agreements","agreements.manage"]
    ]},
    { label: "Finance", items: [
      ["/invoices","invoice","Invoices","billing.manage"],["/billing","billing","Billing rules","billing.manage"],["/payments","payment","Payments","payments.manage"],
      ...(has("servicePlans") ? [["/services","services","Services","services.manage"]] : [])
    ]},
    { label: "Operations", items: [
      ["/operations","modules","Module operations","verticals.manage|requests.review"],
      ...(has("spaceInventory") ? [["/housekeeping","maintenance","Housekeeping","housekeeping.manage"]] : []),
      ...(hasModule("hostel") ? [["/reservations","hostel","Reservations","reservations.manage"]] : []),
      ["/tenant-portal","portal","Tenant portal","people.manage"],["/handover","handover","Handover","handover.manage"],
      ...(has("visitorRegister") ? [["/visitors","visitors","Visitors","visitors.manage"]] : []),
      ...(has("commercialProfiles") ? [["/commercial","commercial","Commercial","verticals.manage"]] : []),
      ["/maintenance","maintenance","Maintenance","maintenance.manage"],["/reports","report","Reports","reports.view"]
    ]},
    { label: "Administration", items: [
      ["/audit","audit","Audit log","audit.view"],["/team","team","Team","team.manage"],["/settings","settings","Settings","settings.manage"]
    ]}
  ];
}

function permissionAllowed(permissions, requirement) {
  return String(requirement || "").split("|").some((permission) => permissions.includes(permission));
}

function routeIsActive(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ compact = false }) {
  return <Link href="/dashboard" className={`brand${compact ? " brand-compact" : ""}`}><span className="brand-mark"><Icon name="building" size={compact ? 19 : 22}/></span><span><strong>NivasaOS</strong><small>Modular property OS</small></span></Link>;
}

function Navigation({ sections, pathname, onNavigate, mobile = false }) {
  return <nav className={mobile ? "drawer-nav" : "side-nav"} aria-label={mobile ? "Mobile navigation" : "Primary navigation"}>{sections.map((section) => <div className="nav-section" key={section.label}><span className="nav-section-label">{section.label}</span><div className="nav-section-items">{section.items.map(([href, icon, label]) => { const active = routeIsActive(pathname, href); return <Link key={href} href={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} onClick={onNavigate}><span className="nav-icon"><Icon name={icon} size={18}/></span><span>{label}</span>{active && <span className="active-indicator" aria-hidden="true"/>}</Link>; })}</div></div>)}</nav>;
}

function UserCard({ user, mobile = false }) {
  return <div className={`user-card${mobile ? " user-card-mobile" : ""}`}><span className="avatar">{user.name.slice(0,1).toUpperCase()}</span><span className="user-copy"><strong>{user.name}</strong><small>{user.role}</small></span></div>;
}

function ModuleStrip({ modules }) {
  return <div className="shell-module-strip" aria-label="Accessible operating modules">{modules.slice(0,4).map((module) => <span className={`module-${module.id}`} key={module.id} title={module.label}><Icon name={module.icon} size={14}/></span>)}{modules.length > 4 && <small>+{modules.length - 4}</small>}</div>;
}

export default function AppShell({ user, company, modules = [], capabilities = [], permissions = [], children }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);
  const drawerCloseRef = useRef(null);
  const menuButtonRef = useRef(null);
  const drawerWasOpenRef = useRef(false);
  const sections = useMemo(() => buildNavigation(capabilities, modules).map((section) => ({ ...section, items: section.items.filter((item) => permissionAllowed(permissions, item[3])) })).filter((section) => section.items.length), [capabilities, modules, permissions]);
  const flatNav = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const current = flatNav.find(([href]) => routeIsActive(pathname, href)) || flatNav[0];
  const mobilePrimary = ["/dashboard","/properties","/operations","/invoices","/maintenance"].map((href) => flatNav.find((item) => item[0] === href)).filter(Boolean).slice(0,4);

  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    document.body.classList.toggle("navigation-open", drawerOpen);
    if (drawerOpen) {
      drawerWasOpenRef.current = true;
      drawerCloseRef.current?.focus();
    } else if (drawerWasOpenRef.current) {
      drawerWasOpenRef.current = false;
      menuButtonRef.current?.focus();
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape" && drawerOpen) { event.preventDefault(); setDrawerOpen(false); return; }
      if (event.key !== "Tab" || !drawerOpen || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.classList.remove("navigation-open"); window.removeEventListener("keydown", onKeyDown); };
  }, [drawerOpen]);

  return <div className="app-shell">
    <style jsx global>{`
      @media (max-width: 720px) {
        .panel:has(> .table-wrap) { overflow: hidden; border: 1px solid var(--line); background: var(--panel); box-shadow: var(--shadow-xs), 0 9px 26px rgba(35, 46, 74, .045); }
        .table-wrap { overflow-x: auto; overflow-y: hidden; overscroll-behavior-inline: contain; -webkit-overflow-scrolling: touch; scrollbar-width: thin; }
        .table-wrap table { min-width: 780px; display: table; }
      }
    `}</style>
    <aside className="sidebar"><Brand/><ModuleStrip modules={modules}/><Navigation sections={sections} pathname={pathname}/><div className="sidebar-bottom"><UserCard user={user}/><form action={logoutAction}><button className="logout-button" aria-label="Sign out"><Icon name="logout" size={18}/></button></form></div></aside>
    <button className={`drawer-scrim${drawerOpen ? " is-open" : ""}`} type="button" aria-label="Close navigation" aria-hidden={!drawerOpen} tabIndex={drawerOpen ? 0 : -1} onClick={() => setDrawerOpen(false)}/>
    <aside ref={drawerRef} id="mobile-navigation-drawer" className={`mobile-drawer${drawerOpen ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-hidden={!drawerOpen} inert={!drawerOpen} aria-label="Navigation drawer"><div className="drawer-head"><Brand compact/><button ref={drawerCloseRef} type="button" className="icon-button drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close navigation"><Icon name="close" size={21}/></button></div><div className="drawer-company"><span className="live-dot"/><span><small>Current workspace</small><strong>{company}</strong></span><ModuleStrip modules={modules}/></div><Navigation sections={sections} pathname={pathname} onNavigate={() => setDrawerOpen(false)} mobile/><div className="drawer-footer"><UserCard user={user} mobile/><form action={logoutAction}><button className="button secondary drawer-logout"><Icon name="logout" size={17}/>Sign out</button></form></div></aside>
    <div className="workspace"><header className="topbar"><div className="mobile-topbar-start"><button ref={menuButtonRef} type="button" className="mobile-menu-button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation" aria-expanded={drawerOpen} aria-controls="mobile-navigation-drawer"><Icon name="menu" size={22}/></button><div className="mobile-page-title"><span>{current?.[2] || "Workspace"}</span><small>{company}</small></div></div><div className="desktop-topbar-start"><span className="topbar-kicker">Modular workspace</span><strong className="company-name">{company}</strong></div><div className="topbar-meta"><span className="status-pill module-count-pill"><Icon name="modules" size={14}/>{modules.length} module{modules.length === 1 ? "" : "s"}</span><span className="status-pill"><span className="live-dot"/>Self-hosted</span><span className="topbar-user"><span className="avatar avatar-small">{user.name.slice(0,1).toUpperCase()}</span><span><strong>{user.name}</strong><small>{permissions.length} permissions</small></span></span></div></header><main className="content">{children}</main><footer className="footer">Built by <a href="https://aahavlabs.in" target="_blank" rel="noreferrer">Aahav Labs</a><span>•</span><a href="mailto:hi@aahavlabs.in">hi@aahavlabs.in</a></footer></div>
    <nav className="mobile-bottom-nav" aria-label="Quick navigation">{mobilePrimary.map(([href, icon, label]) => { const active = routeIsActive(pathname, href); return <Link href={href} key={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={icon} size={20}/><span>{label}</span></Link>; })}<button type="button" className={drawerOpen ? "is-active" : ""} onClick={() => setDrawerOpen(true)} aria-label="Open all navigation" aria-expanded={drawerOpen} aria-controls="mobile-navigation-drawer"><Icon name="more" size={20}/><span>More</span></button></nav>
  </div>;
}
