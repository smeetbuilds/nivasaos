import "server-only";
import { randomUUID } from "node:crypto";
import { businessDate, workspaceTimeZone } from "@/lib/workspace-localization";

export function money(value, currency = "INR") {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
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

export function dateTimeLabel(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: workspaceTimeZone()
  }).format(new Date(value));
}

export function today() {
  return businessDate();
}

export function uid(prefix) {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}
