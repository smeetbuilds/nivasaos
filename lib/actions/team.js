import { revalidatePath } from "next/cache";
import { hashPassword, requireRole } from "@/lib/auth";
import { all, get, run, transaction } from "@/lib/db";
import { changedFields, recordAudit } from "@/lib/audit";
import { choice, integer, safeRedirect, text } from "@/lib/actions/shared";

function validPropertyIds(formData) {
  return [...new Set(formData.getAll("propertyIds").map(Number).filter(Boolean))];
}

function assertPropertiesExist(propertyIds) {
  if (!propertyIds.length) return;
  const found = all(`SELECT id FROM properties WHERE id IN (${propertyIds.map(() => "?").join(",")})`, propertyIds);
  if (found.length !== propertyIds.length) throw new Error("One or more assigned properties are invalid");
}

export async function createTeamMemberAction(formData) {
  const actor = await requireRole(["owner"]);
  const role = choice(formData, "role", ["admin", "staff"], "staff");
  const email = text(formData, "email", true).toLowerCase();
  const password = text(formData, "password", true);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 10) throw new Error("Password must be at least 10 characters");
  const propertyIds = validPropertyIds(formData);
  assertPropertiesExist(propertyIds);
  transaction(() => {
    const result = run(
      "INSERT INTO users (name,email,password_hash,role) VALUES ($name,$email,$hash,$role)",
      { name: text(formData, "name", true), email, hash: hashPassword(password), role }
    );
    const userId = Number(result.lastInsertRowid);
    propertyIds.forEach((propertyId) => run(
      "INSERT INTO user_properties (user_id,property_id) VALUES ($userId,$propertyId)",
      { userId, propertyId }
    ));
    recordAudit({ actor, action: "create", entityType: "user", entityId: userId, summary: `Created ${role} account for ${email}`, metadata: { role, propertyIds } });
  });
  revalidatePath("/team");
  revalidatePath("/audit");
  safeRedirect("/team", "Team member created");
}

export async function updateTeamMemberAction(formData) {
  const actor = await requireRole(["owner"]);
  const userId = integer(formData, "userId");
  const before = get("SELECT id,name,email,role,status FROM users WHERE id=$userId", { userId });
  if (!before || before.role === "owner") throw new Error("User cannot be changed");
  const role = choice(formData, "role", ["admin", "staff"], before.role);
  const email = text(formData, "email", true).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address");
  const name = text(formData, "name", true);
  const propertyIds = validPropertyIds(formData);
  assertPropertiesExist(propertyIds);
  const duplicate = get("SELECT id FROM users WHERE email=$email AND id!=$userId", { email, userId });
  if (duplicate) throw new Error("Another account already uses this email address");
  const existingPropertyIds = all("SELECT property_id FROM user_properties WHERE user_id=$userId ORDER BY property_id", { userId }).map((row) => Number(row.property_id));
  const fields = changedFields(before, { name, email, role }, ["name", "email", "role"]);
  if (JSON.stringify(existingPropertyIds) !== JSON.stringify([...propertyIds].sort((a, b) => a - b))) fields.push("property_assignments");
  if (!fields.length) safeRedirect("/team", "No team changes detected");
  transaction(() => {
    run("UPDATE users SET name=$name,email=$email,role=$role,updated_at=CURRENT_TIMESTAMP WHERE id=$userId", { name, email, role, userId });
    run("DELETE FROM user_properties WHERE user_id=$userId", { userId });
    propertyIds.forEach((propertyId) => run("INSERT INTO user_properties (user_id,property_id) VALUES ($userId,$propertyId)", { userId, propertyId }));
    if (propertyIds.length) {
      run(`UPDATE maintenance_tickets SET assigned_to=NULL,updated_at=CURRENT_TIMESTAMP
        WHERE assigned_to=? AND status!='resolved' AND property_id NOT IN (${propertyIds.map(() => "?").join(",")})`, [userId, ...propertyIds]);
    } else {
      run("UPDATE maintenance_tickets SET assigned_to=NULL,updated_at=CURRENT_TIMESTAMP WHERE assigned_to=$userId AND status!='resolved'", { userId });
    }
    recordAudit({ actor, action: "update", entityType: "user", entityId: userId, summary: `Updated team account ${email}`, metadata: { fields, role, propertyIds } });
  });
  revalidatePath("/team");
  revalidatePath("/maintenance");
  revalidatePath("/audit");
  safeRedirect("/team", "Team member updated");
}

export async function toggleUserAction(formData) {
  const actor = await requireRole(["owner"]);
  const userId = integer(formData, "userId");
  if (userId === actor.id) throw new Error("You cannot disable your own account");
  const target = get("SELECT status,role,email FROM users WHERE id=$userId", { userId });
  if (!target || target.role === "owner") throw new Error("User cannot be changed");
  const status = target.status === "active" ? "disabled" : "active";
  transaction(() => {
    run("UPDATE users SET status=$status,updated_at=CURRENT_TIMESTAMP WHERE id=$userId", { status, userId });
    if (status === "disabled") {
      run("DELETE FROM sessions WHERE user_id=$userId", { userId });
      run("UPDATE maintenance_tickets SET assigned_to=NULL,updated_at=CURRENT_TIMESTAMP WHERE assigned_to=$userId AND status!='resolved'", { userId });
    }
    recordAudit({ actor, action: status === "disabled" ? "disable" : "enable", entityType: "user", entityId: userId, summary: `${status === "disabled" ? "Disabled" : "Enabled"} ${target.email}` });
  });
  revalidatePath("/team");
  revalidatePath("/audit");
  safeRedirect("/team", `User ${status}`);
}
