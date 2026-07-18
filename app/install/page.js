import { redirect } from "next/navigation";
import { isInstalled } from "@/lib/auth";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { installationProtection } from "@/lib/runtime-config";
import BrandLogo from "@/components/BrandLogo";
import InstallWizard from "@/components/InstallWizard";
import Icon from "@/components/Icon";

export const metadata = { title: "Install modular workspace" };
export const dynamic = "force-dynamic";

export default function InstallPage() {
  if (isInstalled()) redirect("/login");
  const protection = installationProtection();
  return <main className="modular-install-page">
    <aside className="modular-install-story">
      <div className="auth-brand"><BrandLogo branding={DEFAULT_BRANDING} variant="dark"/></div>
      <div className="modular-story-copy"><span className="pill">One platform · Multiple operating models</span><h1>Build the property operating system your portfolio actually needs.</h1><p>Choose residential, PG, hostel, student, staff, or commercial workflows. Every property stays module-specific while finance, security, audit, and reporting remain unified.</p></div>
      <div className="modular-story-points">
        <span><Icon name="modules" size={20}/><strong>Capability driven</strong><small>Relevant inventory, services, visitors, and portal tools appear only where they belong.</small></span>
        <span><Icon name="audit" size={20}/><strong>One trusted ledger</strong><small>Payments, deposits, documents, and actions remain auditable across the entire portfolio.</small></span>
        <span><Icon name="portal" size={20}/><strong>Module-aware portals</strong><small>Residents and business tenants see a focused interface for their exact accommodation model.</small></span>
      </div>
      <div className="auth-credit">Self-hosted · Built by <a href="https://aahavlabs.in">Aahav Labs</a></div>
    </aside>
    <section className="modular-install-panel"><InstallWizard installationProtection={protection}/></section>
  </main>;
}
