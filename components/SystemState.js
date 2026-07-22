import Link from "next/link";
import Icon from "@/components/Icon";

export default function SystemState({
  code,
  eyebrow = "System response",
  title,
  description,
  icon = "audit",
  reference = "",
  primaryHref = "/",
  primaryLabel = "Return home",
  secondaryHref = "",
  secondaryLabel = "",
  children,
  compact = false
}) {
  return <section className={`system-state-card${compact ? " is-compact" : ""}`} aria-labelledby="system-state-title">
    <div className="system-state-symbol" aria-hidden="true"><Icon name={icon} size={28}/></div>
    <div className="system-state-copy">
      <span className="eyebrow">{eyebrow}</span>
      {code && <strong className="system-state-code">{code}</strong>}
      <h1 id="system-state-title">{title}</h1>
      <p>{description}</p>
      {reference && <p className="system-state-reference">Reference: <code>{reference}</code></p>}
    </div>
    <div className="system-state-actions">
      {children}
      {primaryHref && <Link href={primaryHref} className="button primary">{primaryLabel}<Icon name="arrow" size={16}/></Link>}
      {secondaryHref && <Link href={secondaryHref} className="button secondary">{secondaryLabel}<Icon name="arrow" size={16}/></Link>}
    </div>
  </section>;
}
