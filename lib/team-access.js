export function canManageTeamMember(actor, member) {
  if (!actor || !member) return false;
  return member.role !== "owner"
    && Number(member.id) !== Number(actor.id)
    && (actor.role === "owner" || member.role === "staff");
}

export function assertDelegatedTeamTarget(actor, target, userId, {
  selfMessage = "You cannot change your own account",
  roleMessage = "Only the owner can change this account"
} = {}) {
  if (!actor || !target) throw new Error("Team account context is unavailable");
  if (actor.role === "owner") return;
  if (Number(userId) === Number(actor.id)) throw new Error(selfMessage);
  if (target.role !== "staff") throw new Error(roleMessage);
}
