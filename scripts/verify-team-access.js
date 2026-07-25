import fs from "node:fs";
import path from "node:path";
import { assertDelegatedTeamTarget, canManageTeamMember } from "../lib/team-access.js";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const count = (source, value) => source.split(value).length - 1;

const owner = { id: 1, role: "owner" };
const manager = { id: 2, role: "admin" };
const staffManager = { id: 7, role: "staff" };
const ownerTarget = { id: 1, role: "owner" };
const adminTarget = { id: 6, role: "admin" };
const staffTarget = { id: 3, role: "staff" };

assert(canManageTeamMember(owner, adminTarget), "Owners must be able to manage administrators.");
assert(canManageTeamMember(owner, staffTarget), "Owners must be able to manage staff.");
assert(!canManageTeamMember(owner, ownerTarget), "Owner accounts must never expose mutable row actions.");
assert(canManageTeamMember(manager, staffTarget), "Delegated managers must be able to manage scoped staff.");
assert(!canManageTeamMember(manager, adminTarget), "Delegated managers must not expose administrator actions.");
assert(!canManageTeamMember(manager, manager), "Delegated managers must not expose self-management actions.");
assert(canManageTeamMember(staffManager, staffTarget), "Permission-delegated staff managers must be able to manage other scoped staff.");
assert(!canManageTeamMember(staffManager, staffManager), "Permission-delegated staff managers must not manage themselves.");
assert(!canManageTeamMember(null, staffTarget) && !canManageTeamMember(manager, null), "Missing access context must fail closed.");

assertDelegatedTeamTarget(owner, adminTarget, adminTarget.id);
assertDelegatedTeamTarget(manager, staffTarget, staffTarget.id);

let selfError = "";
try {
  assertDelegatedTeamTarget(manager, manager, manager.id, { selfMessage: "self blocked", roleMessage: "role blocked" });
} catch (error) {
  selfError = error.message;
}
assert(selfError === "self blocked", "Delegated self-management must use the action-specific rejection.");

let roleError = "";
try {
  assertDelegatedTeamTarget(manager, adminTarget, adminTarget.id, { selfMessage: "self blocked", roleMessage: "role blocked" });
} catch (error) {
  roleError = error.message;
}
assert(roleError === "role blocked", "Delegated administrator mutation must use the action-specific rejection.");

const page = read("app/(workspace)/team/page.js");
const actions = read("lib/actions/team.js");
const uiVerifier = read("scripts/verify-ui.js");
const packageJson = JSON.parse(read("package.json"));

assert(page.includes('import { canManageTeamMember } from "@/lib/team-access"'), "Team page must import the shared manager contract.");
assert(count(page, "canManageTeamMember(user, member)") === 2, "Shared manager contract must govern row actions and modal generation.");
assert(page.includes("EXISTS (SELECT 1 FROM user_properties assigned WHERE assigned.user_id=u.id)"), "Delegated directory queries must not expose unassigned third-party accounts.");
assert(count(page, '{user.role === "owner" && <option value="admin">Admin</option>}') === 2, "Administrator role choices must remain owner-only.");
assert(actions.includes('import { assertDelegatedTeamTarget } from "@/lib/team-access"'), "Team actions must import the shared mutation contract.");
assert(count(actions, "\n  assertDelegatedTarget(actor,") === 3, "Update, permission, and status mutations must all enforce delegated target scope.");
assert(actions.includes("has_assignments"), "Delegated property scope must reject unassigned accounts.");
assert(count(actions, "\n  assertDelegatedPropertyAssignment(actor, propertyIds)") === 2, "Delegated create and update flows must retain at least one property.");
assert(actions.includes("Only the owner can change administrator accounts"), "Forged administrator status changes must be rejected server-side.");
assert(!uiVerifier.includes('contains(teamPage, "const manageable="'), "UI verification must not depend on whitespace-sensitive source literals.");
assert(packageJson.scripts?.["verify:authorization"]?.includes("verify-team-access.js"), "Team access regression verification must run in the authorization gate.");

console.log("Shared team action visibility, delegated role boundaries, assigned-property scope, forged administrator rejection, and structural verification are enforced.");
