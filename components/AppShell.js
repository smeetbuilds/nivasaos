import Link from "next/link";
import { logoutAction } from "@/app/actions";
import Icon from "@/components/Icon";

const nav = [
  ["/dashboard","dashboard","Overview"],
  ["/properties","property","Properties"],
  ["/units","unit","Units"],
  ["/tenants","tenant","Tenants"],
  ["/leases","lease","Leases"],
  ["/invoices","invoice","Invoices"],
  ["/payments","payment","Payments"],
  ["/maintenance","maintenance","Maintenance"],
  ["/reports","report","Reports"],
  ["/team","team","Team"],
  ["/settings","settings","Settings"]
];

export default function AppShell({ user, company, children }) {
  const filtered = nav.filter(([href]) => user.role === "owner" || href !== "/team");
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/dashboard" className="brand"><span className="brand-mark"><Icon name="building" size={22}/></span><span><strong>NivasaOS</strong><small>Property operations</small></span></Link>
      <nav className="side-nav">{filtered.map(([href,icon,label]) => <Link key={href} href={href}><Icon name={icon} size={18}/><span>{label}</span></Link>)}</nav>
      <div className="sidebar-bottom">
        <div className="user-card"><span className="avatar">{user.name.slice(0,1).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.role}</small></span></div>
        <form action={logoutAction}><button className="logout-button" aria-label="Sign out"><Icon name="logout" size={18}/></button></form>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div><span className="mobile-brand">NivasaOS</span><span className="company-name">{company}</span></div><div className="topbar-meta"><span className="live-dot"></span>Self-hosted</div></header>
      <main className="content">{children}</main>
      <footer className="footer">Built by <a href="https://aahavlabs.in" target="_blank" rel="noreferrer">Aahav Labs</a><span>•</span><a href="mailto:hi@aahavlabs.in">hi@aahavlabs.in</a></footer>
    </div>
  </div>;
}
