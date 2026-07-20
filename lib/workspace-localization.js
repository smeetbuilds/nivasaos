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

function zonedParts(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function utcValue(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

export function zonedDateTimeToIso(value, timeZone = workspaceTimeZone()) {
  const source = String(value || "").trim();
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) throw new Error("Local date and time must use YYYY-MM-DDTHH:mm[:ss]");
  const target = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0)
  };
  const targetUtc = utcValue(target);
  const targetDate = new Date(targetUtc);
  if (Number.isNaN(targetDate.getTime()) || targetDate.toISOString().slice(0, 10) !== `${match[1]}-${match[2]}-${match[3]}`) {
    throw new Error("Local date and time contains an impossible calendar date");
  }
  const zone = assertTimeZone(timeZone);
  let candidate = targetUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rendered = zonedParts(new Date(candidate), zone);
    const adjustment = targetUtc - utcValue(rendered);
    if (adjustment === 0) break;
    candidate += adjustment;
  }
  const resolved = zonedParts(new Date(candidate), zone);
  if (Object.keys(target).some((key) => resolved[key] !== target[key])) {
    throw new Error("Local date and time does not exist in the configured workspace timezone");
  }
  return new Date(candidate).toISOString();
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
