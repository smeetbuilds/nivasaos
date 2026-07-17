export const SEMANTIC_TONES = Object.freeze(["success", "info", "warning", "danger", "neutral", "purple"]);

export const STATUS_TONES = Object.freeze({
  active: "success", paid: "success", available: "success", resolved: "success", approved: "success",
  completed: "success", checked_in: "success", accepted: "success", clean: "success", ready: "success",
  issued: "info", admin: "info", in_progress: "info", part_paid: "info", submitted: "info",
  reserved: "info", open: "info", expected: "info", invited: "info", processing: "info",
  scheduled: "info", occupied: "info", normal: "info", staff: "info", manual: "info", rent: "info",
  reported: "info", prepared: "info", prospect: "info", shared: "info", acknowledged: "success", returned: "success",
  received: "success", credit: "success", excellent: "success", good: "success",
  overdue: "danger", urgent: "danger", disabled: "danger", cancelled: "danger", rejected: "danger",
  no_show: "danger", blocked: "danger", failed: "danger", declined: "danger", dirty: "danger",
  out_of_service: "danger", damaged: "danger", missing: "danger", lost: "danger", debit: "danger",
  high: "warning", draft: "warning", maintenance: "warning", pending: "warning", pending_review: "warning",
  late_fee: "warning", inspection: "warning", percent: "warning", flat: "warning", fair: "warning", running: "warning",
  low: "neutral", former: "neutral", inactive: "neutral", void: "neutral", ended: "neutral",
  checked_out: "neutral", archived: "neutral", unallocated: "neutral", refunded: "neutral", refund: "neutral",
  not_applicable: "neutral", replaced: "neutral", preview: "neutral", none: "neutral",
  owner: "purple"
});

export function normalizeStatus(value) {
  return String(value || "neutral").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

export function toneForStatus(value) {
  const normalized = normalizeStatus(value);
  if (SEMANTIC_TONES.includes(normalized)) return normalized;
  const tone = STATUS_TONES[normalized];
  if (!tone && process.env.NODE_ENV !== "production") throw new Error(`Unregistered status tone: ${normalized}`);
  return tone || "neutral";
}
