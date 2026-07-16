import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { text } from "@/lib/actions/shared";
import { uploadDirectory } from "@/lib/actions/finance-common";

export const DEPOSIT_TYPES = ["received", "refund", "credit", "debit"];

export function paymentMethod(formData) {
  const method = text(formData, "method") || "bank_transfer";
  if (!/^[a-z0-9][a-z0-9_:-]{0,49}$/.test(method)) throw new Error("Payment method is invalid");
  return method;
}

export function validEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("A valid tenant email is required");
  return email;
}

export function limitedText(formData, key, max, required = false) {
  const value = text(formData, key, required);
  if (value.length > max) throw new Error(`${key} must be ${max} characters or fewer`);
  return value;
}

export function validPhone(formData) {
  const value = limitedText(formData, "phone", 40, true);
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 16) throw new Error("Enter a valid phone number with country code");
  return value;
}

export function removeUpload(filename) {
  if (!filename) return;
  try { fs.unlinkSync(path.join(uploadDirectory, path.basename(filename))); } catch {}
}

export function refreshPortalViews() {
  ["/tenant-portal", "/tenants", "/payments", "/invoices", "/maintenance", "/dashboard", "/audit", "/portal", "/portal/billing", "/portal/lease", "/portal/maintenance", "/portal/profile"].forEach(revalidatePath);
}
