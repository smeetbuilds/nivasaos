import { revalidatePath } from "next/cache";
import { createSession, hashPassword, requireRole, requireUser, verifyPassword } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { safeRedirect, text } from "@/lib/actions/shared";

export async function updateSettingsAction(formData) {
  await requireRole(["owner", "admin"]);
  const allowed = ["company_name", "default_currency", "timezone", "whatsapp_template"];
  transaction(() => allowed.forEach(key => {
    const value = text(formData, key);
    run("INSERT INTO settings (key,value,updated_at) VALUES ($key,$value,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP", { key, value });
  }));
  revalidatePath("/settings");
  safeRedirect("/settings", "Settings saved");
}

export async function changePasswordAction(formData) {
  const user = await requireUser();
  const currentPassword = text(formData, "currentPassword", true);
  const newPassword = text(formData, "newPassword", true);
  const confirmation = text(formData, "confirmPassword", true);
  if (newPassword.length < 10) throw new Error("New password must be at least 10 characters");
  if (newPassword !== confirmation) throw new Error("New password confirmation does not match");
  const account = get("SELECT password_hash FROM users WHERE id=$userId", { userId: user.id });
  if (!account || !verifyPassword(currentPassword, account.password_hash)) throw new Error("Current password is incorrect");
  run("UPDATE users SET password_hash=$hash,updated_at=CURRENT_TIMESTAMP WHERE id=$userId", { hash: hashPassword(newPassword), userId: user.id });
  run("DELETE FROM sessions WHERE user_id=$userId", { userId: user.id });
  await createSession(user.id);
  safeRedirect("/settings", "Password changed");
}
