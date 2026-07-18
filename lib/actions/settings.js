import { revalidatePath } from "next/cache";
import { createSession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { all, get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { assertPortfolioPermission } from "@/lib/permissions";
import { safeRedirect, text } from "@/lib/actions/shared";

export async function updateSettingsAction(formData) {
  const actor = await requireUser();
  assertPortfolioPermission(actor, "settings.manage");
  const allowed = ["company_name", "default_country", "default_currency", "timezone", "whatsapp_template"];
  const before = Object.fromEntries(all(`SELECT key,value FROM settings WHERE key IN (${allowed.map(() => "?").join(",")})`, allowed).map((row) => [row.key, row.value]));
  const values = Object.fromEntries(allowed.map((key) => [key, text(formData, key)]));
  values.default_country = values.default_country || "Not specified";
  values.default_currency = values.default_currency || "USD";
  values.timezone = values.timezone || "UTC";
  const fields = allowed.filter((key) => String(before[key] || "") !== String(values[key] || ""));
  if (!fields.length) safeRedirect("/settings", "No settings changes detected");
  transaction(() => {
    allowed.forEach((key) => run("INSERT INTO settings (key,value,updated_at) VALUES ($key,$value,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP", { key, value: values[key] }));
    recordAudit({ actor, action: "settings", entityType: "settings", summary: "Updated workspace settings", metadata: { fields } });
  });
  revalidatePath("/settings"); revalidatePath("/properties"); revalidatePath("/dashboard"); revalidatePath("/audit");
  safeRedirect("/settings", "Settings saved");
}

export async function changePasswordAction(formData) {
  const actor = await requireUser();
  const currentPassword = text(formData, "currentPassword", true);
  const newPassword = text(formData, "newPassword", true);
  const confirmation = text(formData, "confirmPassword", true);
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
