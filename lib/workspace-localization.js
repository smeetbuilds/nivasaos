import "server-only";
import { get } from "@/lib/db";

let cachedTimeZone = null;

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

export function invalidateWorkspaceLocalizationCache() {
  cachedTimeZone = null;
}

export function workspaceTimeZone() {
  if (cachedTimeZone) return cachedTimeZone;
  const configured = get("SELECT value FROM settings WHERE key='timezone'")?.value;
  if (!configured) throw new Error("Workspace timezone is not configured");
  cachedTimeZone = assertTimeZone(configured);
  return cachedTimeZone;
}

export function businessDate(value = new Date(), timeZone = workspaceTimeZone()) {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error("Business date source is invalid");
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(instant);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}
