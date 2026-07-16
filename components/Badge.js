export default function Badge({ children, tone }) {
  const normalized = String(tone || children || "neutral").toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
  return <span className={`badge badge-${normalized}`}>{children}</span>;
}
