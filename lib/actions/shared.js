import { redirect } from "next/navigation";
import { canAccessProperty } from "@/lib/auth";

export function text(formData, key, required = false) {
  const value = String(formData.get(key) || "").trim();
  if (required && !value) throw new Error(`${key} is required`);
  return value;
}

export function number(formData, key, fallback = 0) {
  const raw = formData.get(key);
  const value = raw === null || raw === "" ? fallback : Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${key} must be a number`);
  return value;
}

export function integer(formData, key, fallback = 0) {
  return Math.trunc(number(formData, key, fallback));
}

export function safeRedirect(pathname, message, type = "success") {
  const join = pathname.includes("?") ? "&" : "?";
  redirect(`${pathname}${join}${type}=${encodeURIComponent(message)}`);
}

export async function assertProperty(formData, user) {
  const propertyId = integer(formData, "propertyId");
  if (!propertyId || !canAccessProperty(user, propertyId)) throw new Error("Property access denied");
  return propertyId;
}
