import { revalidatePath } from "next/cache";
import { hashPassword, requireUser } from "@/lib/auth";
import { all, get, run, transaction } from "@/lib/db";
import { changedFields, recordAudit } from "@/lib/audit";
import { PROPERTY_SCOPED_PERMISSIONS, assertPortfolioPermission, hasPermission, hasPortfolioPermission } from "@/lib/permissions";
import { choice, integer, passwordInput, safeRedirect, text } from "@/lib/actions/shared";
import { PERMISSIONS } from "@/lib/verticals";

function validPropertyIds(formData) {
  return [...new Set(formData.getAll("propertyIds").map(Number).filter(Boolean))];
}
function assertPropertiesExist(actor, propertyIds) {
  if (!propertyIds.length) return;
  const found = actor.role === "owner"
    ? all(`SELECT id FROM properties WHERE id IN (${propertyIds.map(() => "?").join(",")})`, propertyIds)
    : all(`SELECT p.id FROM properties p JOIN user_properties up ON up.property_id=p.id WHERE up.user_id=? AND p.id IN (${propertyIds.map(() => "?").join(",")})`, [actor.id, ...propertyIds]);
  if (found.length !== propertyIds.length) throw new Error("One or more assigned properties are outside your access scope");
}
function refreshTeamViews() {
  ["/team", "/maintenance", "/operations", "/reservations", "/housekeeping", "/audit"].forEach(revalidatePath);
}
async function requireTeamManager() {
  const actor = await requireUser();
  assertPortfolioPermission(actor, "team.manage");
  return actor;
}

function assertTargetWithinManagerScope(actor, userId) {
  if (actor.role === "owner") return;
  const outside = get(
    `SELECT 1 FROM user_properties target
     WHERE target.user_id=$userId AND target.property_id NOT IN (
       SELECT property_id FROM user_properties WHERE user_id=$actorId
     ) LIMIT 1`,
    { userId: Number(userId), actorId: Number(actor.id) }
  );
  if (outside) throw new Error("Team member has property access outside your management scope");
}

export async function createTeamMemberAction(formData) {
  const actor = await requireTeamManager();
  const allowedRoles = actor.role === "owner" ? ["admin", "staff"] : ["staff"];
  const role = choice(formData, "role", allowedRoles, "staff");
  const email = text(formData, "email", true).toLowerCase();
  const password = passwordInput(formData, "password");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 10) throw new Error("Password must be at least 10 characters");
  const propertyIds = validPropertyIds(formData);
  assertPropertiesExist(actor, propertyIds);
  transaction(() => {
    const result = run("INSERT INTO users (name,email,password_hash,role) VALUES ($name,$email,$hash,$role)", { name: text(formData, "name", true), email, hash: hashPassword(password), role });
    const userId = Number(result.lastInsertRowid);
    propertyIds.forEach((propertyId) => run("INSERT INTO user_properties (user_id,property_id) VALUES ($userId,$propertyId)", { userId, propertyId }));
    recordAudit({ actor, action: "create", entityType: "user", entityId: userId, summary: `Created ${role} account for ${email}`, metadata: { role, propertyIds } });
  });
  refreshTeamViews();
  safeRedirect("/team", "Team member created");
}

export async function updateTeamMemberAction(formData) {
  const actor = await requireTeamManager();
  const userId = integer(formData, "userId");
  const before = get("SELECT id,name,email,role,status FROM users WHERE id=$userId", { userId });
  if (!before || before.role === "owner") throw new Error("User cannot be changed");
  if (actor.role !== "owner" && (userId === Number(actor.id) || before.role !== "staff")) throw new Error("Only the owner can change this account");
  assertTargetWithinManagerScope(actor, userId);
  const allowedRoles = actor.role === "owner" ? ["admin", "staff"] : ["staff"];
  const role = choice(formData, "role", allowedRoles, before.role);
  const email = text(formData, "email", true).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address");
  const name = text(formData, "name", true);
  const propertyIds = validPropertyIds(formData);
  assertPropertiesExist(actor, propertyIds);
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
    run("DELETE FROM permission_grants WHERE user_id=$userId AND property_id IS NOT NULL AND property_id NOT IN (SELECT property_id FROM user_properties WHERE user_id=$userId)", { userId });
    if (propertyIds.length) run(`UPDATE maintenance_tickets SET assigned_to=NULL,updated_at=CURRENT_TIMESTAMP WHERE assigned_to=? AND status!='resolved' AND property_id NOT IN (${propertyIds.map(() => "?").join(",")})`, [userId, ...propertyIds]);
    else run("UPDATE maintenance_tickets SET assigned_to=NULL,updated_at=CURRENT_TIMESTAMP WHERE assigned_to=$userId AND status!='resolved'", { userId });
    run("DELETE FROM sessions WHERE user_id=$userId", { userId });
    recordAudit({ actor, action: "update", entityType: "user", entityId: userId, summary: `Updated team account ${email}`, metadata: { fields, role, propertyIds, sessionsRevoked: true } });
  });
  refreshTeamViews();
  safeRedirect("/team", "Team member updated");
}

export async function updateUserPermissionsAction(formData) {
  const actor = await requireTeamManager();
  const userId = integer(formData, "userId");
  const propertyId = integer(formData, "permissionPropertyId") || null;
  const target = get("SELECT id,name,email,role FROM users WHERE id=$userId", { userId });
  if (!target || target.role === "owner") throw new Error("Owner permissions cannot be overridden");
  if (actor.role !== "owner" && userId === Number(actor.id)) throw new Error("You cannot change your own permissions");
  if (actor.role !== "owner" && target.role !== "staff") throw new Error("Only the owner can change administrator permissions");
  assertTargetWithinManagerScope(actor, userId);
  if (propertyId && !get("SELECT 1 FROM user_properties WHERE user_id=$userId AND property_id=$propertyId", { userId, propertyId })) throw new Error("Assign the property before granting property permissions");
  const requested = new Set(formData.getAll("permissions").map(String).filter((permission) => PERMISSIONS.includes(permission)));
  const targetPropertyIds = propertyId
    ? [propertyId]
    : all("SELECT property_id FROM user_properties WHERE user_id=$userId ORDER BY property_id", { userId }).map((row) => Number(row.property_id));
  const propertyScoped = new Set(PROPERTY_SCOPED_PERMISSIONS);
  const grantable = actor.role === "owner" ? new Set(PERMISSIONS) : new Set(PERMISSIONS.filter((permission) => {
    if (!propertyScoped.has(permission)) return hasPortfolioPermission(actor, permission);
    return targetPropertyIds.length > 0 && targetPropertyIds.every((targetPropertyId) => hasPermission(actor, permission, targetPropertyId));
  }));
  const disallowed = [...requested].filter((permission) => !grantable.has(permission));
  if (disallowed.length) throw new Error(`You cannot grant permissions outside your authority: ${disallowed.join(", ")}`);
  const allowed = requested;
  transaction(() => {
    if (propertyId) run("DELETE FROM permission_grants WHERE user_id=$userId AND property_id=$propertyId", { userId, propertyId });
    else run("DELETE FROM permission_grants WHERE user_id=$userId AND property_id IS NULL", { userId });
    for (const permission of PERMISSIONS) run("INSERT INTO permission_grants (user_id,property_id,permission,allowed,granted_by) VALUES ($userId,$propertyId,$permission,$allowed,$actorId)", { userId, propertyId, permission, allowed: allowed.has(permission) ? 1 : 0, actorId: actor.id });
    run("DELETE FROM sessions WHERE user_id=$userId", { userId });
    recordAudit({ actor, action: "security", entityType: "permission_matrix", entityId: userId, propertyId, summary: `Updated permissions for ${target.email}`, metadata: { propertyId, allowed: [...allowed] } });
  });
  refreshTeamViews();
  safeRedirect("/team", propertyId ? "Property permissions updated" : "Global permissions updated");
}

export async function toggleUserAction(formData) {
  const actor = await requireTeamManager();
  const userId = integer(formData, "userId");
  if (userId === actor.id) throw new Error("You cannot disable your own account");
  const target = get("SELECT status,role,email FROM users WHERE id=$userId", { userId });
  if (!target || target.role === "owner") throw new Error("User cannot be changed");
  assertTargetWithinManagerScope(actor, userId);
  const status = target.status === "active" ? "disabled" : "active";
  transaction(() => {
    run("UPDATE users SET status=$status,updated_at=CURRENT_TIMESTAMP WHERE id=$userId", { status, userId });
    if (status === "disabled") {
      run("DELETE FROM sessions WHERE user_id=$userId", { userId });
      run("UPDATE maintenance_tickets SET assigned_to=NULL,updated_at=CURRENT_TIMESTAMP WHERE assigned_to=$userId AND status!='resolved'", { userId });
    }
    recordAudit({ actor, action: status === "disabled" ? "disable" : "enable", entityType: "user", entityId: userId, summary: `${status === "disabled" ? "Disabled" : "Enabled"} ${target.email}` });
  });
  refreshTeamViews();
  safeRedirect("/team", `User ${status}`);
}
