"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { logoutAction } from "@/app/actions";
import Icon from "@/components/Icon";

function buildNavigation(capabilities) {
  const has = (capability) => capabilities.includes(capability);
  return [
    { label: "Workspace", items: [["/dashboard", "dashboard", "Overview"], ["/modules", "modules", "Modules"]] },
    {
      label: "Portfolio",
      items: [
        ["/properties", "property", "Properties"],
        ["/units", "unit", "Units"],
        ...(has("spaceInventory") ? [["/spaces", "spaces", "Beds & spaces"]] : []),
        ["/tenants", "tenant", "People"],
        ["/leases", "lease", "Agreements"]
      ]
    },
    {
      label: "Finance",
      items: [
        ["/invoices", "invoice", "Invoices"],
        ["/billing", "billing", "Billing rules"],
        ["/payments", "payment", "Payments"],
        ...(has("servicePlans") ? [["/services", "services", "Services"]] : [])
      ]
    },
    {
      label: "Operations",
      items: [
        ["/tenant-portal", "portal", "Tenant portal"],
        ["/handover", "handover", "Handover"],
        ...(has("visitorRegister") ? [["/visitors", "visitors", "Visitors"]] : []),
        ...(has("commercialProfiles") ? [["/commercial", "commercial", "Commercial"]] : []),
        ["/maintenance", "maintenance", "Maintenance"],
        ["/reports", "report", "Reports"]
      ]
    },
    {
      label: "Administration",
      items: [
        ["/audit", "audit", "Audit log"],
        ["/team", "team", "Team"],
        ["/settings", "settings", "Settings"]
      ]
    }
  ];
}

function canAccess(user, href) {
  if (user.role === "owner") return true;
  if (user.role === "admin") return !["/team", "/audit"].includes(href);
  return !["/team", "/audit", "/billing"].includes(href);
}

function routeIsActive(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ compact = false }) {
  return <Link href="/dashboard" className={`brand${compact ? " brand-compact" : ""}`}>
    <span className="brand-mark"><Icon name="building" size={compact ? 19 : 22}/></span>
    <span><strong>NivasaOS</strong><small>Modular property OS</small></span>
  </Link>;
}

function Navigation({ sections, pathname, onNavigate, mobile = false }) {
  return <nav className={mobile ? "drawer-nav" : "side-nav"} aria-label={mobile ? "Mobile navigation" : "Primary navigation"}>
    {sections.map((section) => <div className="nav-section" key={section.label}>
      <span className="nav-section-label">{section.label}</span>
      <div className="nav-section-items">
        {section.items.map(([href, icon, label]) => {
          const active = routeIsActive(pathname, href);
          return <Link key={href} href={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} onClick={onNavigate}>
            <span className="nav-icon"><Icon name={icon} size={18}/></span><span>{label}</span>{active && <span className="active-indicator" aria-hidden="true"/>}
          </Link>;
        })}
      </div>
    </div>)}
  </nav>;
}

function UserCard({ user, mobile = false }) {
  return <div className={`user-card${mobile ? " user-card-mobile" : ""}`}>
    <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
    <span className="user-copy"><strong>{user.name}</strong><small>{user.role}</small></span>
  </div>;
}

function ModuleStrip({ modules }) {
  return <div className="shell-module-strip" aria-label="Enabled operating modules">{modules.slice(0, 4).map((module) => <span className={`module-${module.id}`} key={module.id} title={module.label}><Icon name={module.icon} size={14}/></span>)}{modules.length > 4 && <small>+{modules.length - 4}</small>}</div>;
}

export default function AppShell({ user, company, modules = [], capabilities = [], children }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerCloseRef = useRef(null);
  const sections = useMemo(() => buildNavigation(capabilities).map((section) => ({ ...section, items: section.items.filter(([href]) => canAccess(user, href)) })).filter((section) => section.items.length), [user, capabilities]);
  const flatNav = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const current = flatNav.find(([href]) => routeIsActive(pathname, href)) || flatNav[0];
  const mobilePrimary = ["/dashboard", "/properties", "/invoices", "/maintenance"].map((href) => flatNav.find((item) => item[0] === href)).filter(Boolean);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.classList.toggle("navigation-open", drawerOpen);
    if (drawerOpen) drawerCloseRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.classList.remove("navigation-open"); window.removeEventListener("keydown", onKeyDown); };
  }, [drawerOpen]);
  useEffect(() => {
    const labelTables = () => {
      document.querySelectorAll(".table-wrap table").forEach((table) => {
        const labels = [...table.querySelectorAll("thead th")].map((cell) => cell.textContent?.trim() || "Details");
        table.querySelectorAll("tbody tr").forEach((row) => { [...row.children].forEach((cell, index) => { if (cell.tagName === "TD") cell.dataset.label = labels[index] || "Details"; }); });
        table.dataset.mobileReady = "true";
      });
    };
    labelTables();
    const observer = new MutationObserver(labelTables);
    observer.observe(document.querySelector(".content") || document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, children]);

  return <div className="app-shell">
    <aside className="sidebar"><Brand/><ModuleStrip modules={modules}/><Navigation sections={sections} pathname={pathname}/><div className="sidebar-bottom"><UserCard user={user}/><form action={logoutAction}><button className="logout-button" aria-label="Sign out"><Icon name="logout" size={18}/></button></form></div></aside>
    <button className={`drawer-scrim${drawerOpen ? " is-open" : ""}`} type="button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}/>
    <aside className={`mobile-drawer${drawerOpen ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-hidden={!drawerOpen} inert={!drawerOpen} aria-label="Navigation drawer">
      <div className="drawer-head"><Brand compact/><button ref={drawerCloseRef} type="button" className="icon-button drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close navigation"><Icon name="close" size={21}/></button></div>
      <div className="drawer-company"><span className="live-dot"/><span><small>Current workspace</small><strong>{company}</strong></span><ModuleStrip modules={modules}/></div>
      <Navigation sections={sections} pathname={pathname} onNavigate={() => setDrawerOpen(false)} mobile/>
      <div className="drawer-footer"><UserCard user={user} mobile/><form action={logoutAction}><button className="button secondary drawer-logout"><Icon name="logout" size={17}/>Sign out</button></form></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="mobile-topbar-start"><button type="button" className="mobile-menu-button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation" aria-expanded={drawerOpen}><Icon name="menu" size={22}/></button><div className="mobile-page-title"><span>{current?.[2] || "Workspace"}</span><small>{company}</small></div></div><div className="desktop-topbar-start"><span className="topbar-kicker">Modular workspace</span><strong className="company-name">{company}</strong></div><div className="topbar-meta"><span className="status-pill module-count-pill"><Icon name="modules" size={14}/>{modules.length} module{modules.length === 1 ? "" : "s"}</span><span className="status-pill"><span className="live-dot"/>Self-hosted</span><span className="topbar-user"><span className="avatar avatar-small">{user.name.slice(0, 1).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.role}</small></span></span></div></header>
      <main className="content">{children}</main>
      <footer className="footer">Built by <a href="https://aahavlabs.in" target="_blank" rel="noreferrer">Aahav Labs</a><span>•</span><a href="mailto:hi@aahavlabs.in">hi@aahavlabs.in</a></footer>
    </div>
    <nav className="mobile-bottom-nav" aria-label="Quick navigation">{mobilePrimary.map(([href, icon, label]) => { const active = routeIsActive(pathname, href); return <Link href={href} key={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={icon} size={20}/><span>{label}</span></Link>; })}<button type="button" className={drawerOpen ? "is-active" : ""} onClick={() => setDrawerOpen(true)} aria-label="Open all navigation"><Icon name="more" size={20}/><span>More</span></button></nav>
  </div>;
}
