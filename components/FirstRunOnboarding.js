import Link from "next/link";
import Icon from "@/components/Icon";

function SetupStep({ complete, icon, title, description, href, action }) {
  return <li className={complete ? "is-complete" : ""}>
    <span className="first-run-step-icon" aria-hidden="true"><Icon name={complete ? "check" : icon} size={18}/></span>
    <span className="first-run-step-copy"><strong>{title}</strong><small>{description}</small></span>
    {href ? <Link href={href} className={complete ? "text-link" : "button secondary small"}>{complete ? "Review" : action}<Icon name="arrow" size={14}/></Link> : <span className="first-run-step-state">{complete ? "Complete" : "Permission required"}</span>}
  </li>;
}

export default function FirstRunOnboarding({ firstName, totalProperties, totalUnits, activeAgreements, permissions }) {
  const steps = [
    { id: "models", complete: true, icon: "modules", title: "Operating models", description: "Your selected modules are enabled and ready for property-specific configuration.", href: permissions.settings ? "/modules" : null, action: "Review modules" },
    { id: "properties", complete: Number(totalProperties) > 0, icon: "property", title: "Add the first property", description: "Choose the correct operating model before adding rooms, spaces, people, or finance records.", href: permissions.properties ? "/properties" : null, action: "Add property" },
    { id: "inventory", complete: Number(totalUnits) > 0, icon: "unit", title: "Create usable inventory", description: "Add units, rooms, or assignable spaces that match the selected property model.", href: permissions.inventory ? "/units" : null, action: "Add inventory" },
    { id: "agreements", complete: Number(activeAgreements) > 0, icon: "lease", title: "Create the first agreement", description: "Connect a person or business to the correct property and inventory record.", href: permissions.agreements ? "/leases" : null, action: "Add agreement" }
  ];
  const completed = steps.filter((item) => item.complete).length;
  const next = steps.find((item) => !item.complete && item.href);

  return <section className="first-run-onboarding" aria-labelledby="first-run-title">
    <div className="first-run-head">
      <div><span className="eyebrow">First-run onboarding</span><h2 id="first-run-title">Your workspace is ready, {firstName}.</h2><p>Complete the core setup sequence before recording live finance or operational activity.</p></div>
      <div className="first-run-progress-copy"><strong>{completed}/{steps.length}</strong><span>core steps complete</span></div>
    </div>
    <progress max={steps.length} value={completed} aria-label={`${completed} of ${steps.length} first-run setup steps complete`}>{completed}/{steps.length}</progress>
    <ol className="first-run-steps">{steps.map((item) => <SetupStep key={item.id} {...item}/>)}</ol>
    <div className="first-run-foot"><span><Icon name="audit" size={17}/>Permissions, currency, timezone, and module relationships remain enforced while you configure the workspace.</span><div>{permissions.settings && <Link href="/settings" className="text-link">Review branding and regional defaults</Link>}{next ? <Link href={next.href} className="button primary">{next.action}<Icon name="arrow" size={16}/></Link> : <Link href="/dashboard" className="button primary">Continue to dashboard<Icon name="arrow" size={16}/></Link>}</div></div>
  </section>;
}
