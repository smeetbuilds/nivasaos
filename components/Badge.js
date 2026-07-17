import { normalizeStatus, toneForStatus } from "@/lib/statuses";

export default function Badge({ children, tone }) {
  const status = normalizeStatus(tone || children);
  const semanticTone = toneForStatus(status);
  return <span className={`badge badge-${semanticTone}`} data-status={status}>{children}</span>;
}
