import { randomUUID } from "node:crypto";

export function money(value, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

export function dateLabel(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

export function dateTimeLabel(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function uid(prefix) {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}
