import { redirect } from "next/navigation";
import { canAccessProperty } from "@/lib/auth";

export function text(formData, key, required = false) {
  const value = String(formData.get(key) || "").trim();
  if (required && !value) throw new Error(`${key} is required`);
  return value;
}

export function passwordInput(formData, key) {
  const value = String(formData.get(key) || "");
  if (!value) throw new Error(`${key} is required`);
  if (value.length > 256) throw new Error("Passwords must be 256 characters or fewer");
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

export function choice(formData, key, allowed, fallback = "") {
  const value = text(formData, key) || fallback;
  if (!allowed.includes(value)) throw new Error(`${key} is invalid`);
  return value;
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
