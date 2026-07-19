import "server-only";
import { get } from "@/lib/db";

const FALLBACK_TIMEZONE = "UTC";

export function validTimeZone(value) {
  const candidate = String(value || "").trim();
  if (!candidate || candidate.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function assertTimeZone(value) {
  const candidate = String(value || "").trim();
  if (!validTimeZone(candidate)) throw new Error("Timezone must be a valid IANA timezone such as Asia/Kolkata or Europe/London");
  return candidate;
}

export function workspaceTimeZone() {
  try {
    const configured = get("SELECT value FROM settings WHERE key='timezone'")?.value;
    return validTimeZone(configured) ? configured : FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

export function businessDate(value = new Date(), timeZone = workspaceTimeZone()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}
