import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { all, get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { uploadDirectory } from "@/lib/actions/finance-common";
import { BRAND_SETTING_KEYS } from "@/lib/branding";
import { assertPortfolioPermission } from "@/lib/permissions";
import { safeRedirect, text } from "@/lib/actions/shared";
import { assertTimeZone } from "@/lib/workspace-localization";

const GENERAL_SETTING_KEYS = ["company_name", "default_country", "default_currency", "timezone", "whatsapp_template"];
const CURRENCIES = new Set(["INR", "USD", "GBP", "EUR", "AED", "AUD", "CAD", "SGD"]);
const ASSET_FIELDS = [
  ["brand_logo_light", "logo-light", false],
  ["brand_logo_dark", "logo-dark", false],
  ["brand_symbol_light", "symbol-light", false],
  ["brand_symbol_dark", "symbol-dark", false],
  ["brand_favicon", "favicon", true]
];

function limitedSetting(formData, key, max, fallback = "") {
  const value = text(formData, key) || fallback;
  if (value.length > max) throw new Error(`${key} must be ${max} characters or fewer`);
  return value;
}

function validBrandFilePath(value) {
  const normalized = String(value || "").replaceAll("\\", "/");
  if (!/^branding\/[a-z0-9-]+\.(png|jpe?g|webp|ico)$/.test(normalized)) return null;
  const root = path.resolve(uploadDirectory, "branding");
  const candidate = path.resolve(uploadDirectory, normalized);
  return candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

function removeBrandFile(value) {
  const filePath = validBrandFilePath(value);
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch {}
}

async function saveBrandFile(file, slug, favicon = false) {
  if (!file || typeof file === "string" || Number(file.size || 0) === 0) return null;
  if (file.size > 2 * 1024 * 1024) throw new Error("Brand images must be 2 MB or smaller");
  const allowed = new Map([
    ["image/png", ".png"], ["image/jpeg", ".jpg"], ["image/webp", ".webp"],
    ...(favicon ? [["image/x-icon", ".ico"], ["image/vnd.microsoft.icon", ".ico"]] : [])
  ]);
  const ext = allowed.get(file.type) || (favicon && String(file.name || "").toLowerCase().endsWith(".ico") ? ".ico" : null);
  if (!ext) throw new Error(favicon ? "Brand favicon must be PNG, JPG, WebP, or ICO" : "Brand logos must be PNG, JPG, or WebP");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (from, length) => String.fromCharCode(...bytes.slice(from, from + length));
  const valid =
    (ext === ".png" && bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 3) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) ||
    (ext === ".jpg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (ext === ".webp" && bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") ||
    (ext === ".ico" && bytes.length >= 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0 && (bytes[4] !== 0 || bytes[5] !== 0));
  if (!valid) throw new Error("The uploaded brand image does not match its declared file type");
  const relative = `branding/${slug}-${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;
  const destination = path.resolve(uploadDirectory, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  await Bun.write(destination, bytes);
  try { fs.chmodSync(destination, 0o600); } catch {}
  return relative;
}

export async function updateSettingsAction(formData) {
  const actor = await requireUser();
  assertPortfolioPermission(actor, "settings.manage");
  const keys = [...GENERAL_SETTING_KEYS, ...BRAND_SETTING_KEYS];
  const before = Object.fromEntries(all(`SELECT key,value FROM settings WHERE key IN (${keys.map(() => "?").join(",")})`, keys).map((row) => [row.key, row.value]));
  const currency = limitedSetting(formData, "default_currency", 3, "USD").toUpperCase();
  if (!CURRENCIES.has(currency)) throw new Error("Select a supported currency");
  const values = {
    company_name: limitedSetting(formData, "company_name", 160),
    default_country: limitedSetting(formData, "default_country", 100, "Not specified"),
    default_currency: currency,
    timezone: assertTimeZone(text(formData, "timezone") || "UTC"),
    whatsapp_template: limitedSetting(formData, "whatsapp_template", 2000),
    brand_name: limitedSetting(formData, "brand_name", 80, "NivasaOS"),
    brand_tagline: limitedSetting(formData, "brand_tagline", 120, "Property operations"),
    white_label_enabled: formData.get("white_label_enabled") === "on" ? "1" : "0"
  };

  const createdFiles = [];
  try {
    for (const [setting, slug, favicon] of ASSET_FIELDS) {
      const remove = formData.get(`remove_${setting}`) === "on";
      const uploaded = remove ? null : await saveBrandFile(formData.get(setting), slug, favicon);
      if (uploaded) createdFiles.push(uploaded);
      values[setting] = remove ? "" : uploaded || before[setting] || "";
    }

    const fields = keys.filter((key) => String(before[key] || "") !== String(values[key] || ""));
    if (!fields.length) {
      createdFiles.forEach(removeBrandFile);
      safeRedirect("/settings", "No settings changes detected");
    }

    transaction(() => {
      keys.forEach((key) => run("INSERT INTO settings (key,value,updated_at) VALUES ($key,$value,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP", { key, value: values[key] || "" }));
      recordAudit({ actor, action: "settings", entityType: "settings", summary: "Updated workspace and white-label settings", metadata: { fields } });
    });

    for (const [setting] of ASSET_FIELDS) if (before[setting] && before[setting] !== values[setting]) removeBrandFile(before[setting]);
  } catch (error) {
    createdFiles.forEach(removeBrandFile);
    throw error;
  }

  revalidatePath("/", "layout");
  for (const page of ["/settings", "/properties", "/dashboard", "/audit", "/login", "/portal"]) revalidatePath(page);
  safeRedirect("/settings", "Settings and branding saved");
}

export async function changePasswordAction(formData) {
  const actor = await requireUser();
  const currentPassword = text(formData, "currentPassword", true);
  const newPassword = text(formData, "newPassword", true);
  const confirmation = text(formData, "confirmPassword", true);
  if (currentPassword.length > 256 || newPassword.length > 256) throw new Error("Passwords must be 256 characters or fewer");
  if (newPassword.length < 10) throw new Error("New password must be at least 10 characters");
  if (newPassword !== confirmation) throw new Error("New password confirmation does not match");
  const account = get("SELECT password_hash FROM users WHERE id=$userId", { userId: actor.id });
  if (!account || !verifyPassword(currentPassword, account.password_hash)) throw new Error("Current password is incorrect");
  transaction(() => {
    run("UPDATE users SET password_hash=$hash,updated_at=CURRENT_TIMESTAMP WHERE id=$userId", { hash: hashPassword(newPassword), userId: actor.id });
    run("DELETE FROM sessions WHERE user_id=$userId", { userId: actor.id });
    recordAudit({ actor, action: "security", entityType: "user", entityId: actor.id, summary: "Changed account password" });
  });
  await createSession(actor.id);
  revalidatePath("/audit");
  safeRedirect("/settings", "Password changed");
}
