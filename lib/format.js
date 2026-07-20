import "server-only";
import { randomUUID } from "node:crypto";
import { businessDate, workspaceTimeZone, zonedDateTimeToIso } from "@/lib/workspace-localization";

export function money(value, currency = "INR") {
  const normalizedCurrency = String(currency || "INR").toUpperCase();
  const locale = normalizedCurrency === "INR" ? "en-IN" : "en";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: normalizedCurrency,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

export function dateLabel(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`));
}

function normalizedTimestamp(value) {
  const source = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(source)) return `${source.replace(" ", "T")}Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(source)) return zonedDateTimeToIso(source);
  return source;
}

export function dateTimeLabel(value) {
  if (!value) return "—";
  const instant = new Date(normalizedTimestamp(value));
  if (Number.isNaN(instant.getTime())) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: workspaceTimeZone()
  }).format(instant);
}

export function today() {
  return businessDate();
}

export function uid(prefix) {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}
