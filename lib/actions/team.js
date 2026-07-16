import { revalidatePath } from "next/cache";
import { hashPassword, requireRole } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { integer, safeRedirect, text } from "@/lib/actions/shared";

export async function createTeamMemberAction(formData) {
  const actor = await requireRole(["owner"]);
  const role = text(formData, "role") || "staff";
  if (!["admin", "staff"].includes(role)) throw new Error("Invalid role");
  const email = text(formData, "email", true).toLowerCase();
  const password = text(formData, "password", true);
  if (password.length < 10) throw new Error("Password must be at least 10 characters");
  const propertyIds = formData.getAll("propertyIds").map(Number).filter(Boolean);
  transaction(() => {
    const result = run(
      "INSERT INTO users (name,email,password_hash,role) VALUES ($name,$email,$hash,$role)",
      { name: text(formData, "name", true), email, hash: hashPassword(password), role }
    );
    const userId = Number(result.lastInsertRowid);
    propertyIds.forEach(propertyId => run(
      "INSERT INTO user_properties (user_id,property_id) SELECT $userId,$propertyId WHERE EXISTS (SELECT 1 FROM properties WHERE id=$propertyId)",
      { userId, propertyId }
    ));
  });
  revalidatePath("/team");
  safeRedirect("/team", "Team member created");
}

export async function toggleUserAction(formData) {
  const actor = await requireRole(["owner"]);
  const userId = integer(formData, "userId");
  if (userId === actor.id) throw new Error("You cannot disable your own account");
  const target = get("SELECT status,role FROM users WHERE id=$userId", { userId });
  if (!target || target.role === "owner") throw new Error("User cannot be changed");
  const status = target.status === "active" ? "disabled" : "active";
  run("UPDATE users SET status=$status,updated_at=CURRENT_TIMESTAMP WHERE id=$userId", { status, userId });
  if (status === "disabled") run("DELETE FROM sessions WHERE user_id=$userId", { userId });
  revalidatePath("/team");
  safeRedirect("/team", `User ${status}`);
}
