export const LATE_FEE_TYPES = ["none", "flat", "percent"];

export function calculateLateFee(balance, policy) {
  const outstanding = Math.max(0, Number(balance || 0));
  const value = Math.max(0, Number(policy?.late_fee_value || 0));
  if (!outstanding || policy?.late_fee_type === "none" || !value) return 0;
  let fee = policy.late_fee_type === "percent" ? outstanding * value / 100 : value;
  const cap = Number(policy?.late_fee_cap || 0);
  if (cap > 0) fee = Math.min(fee, cap);
  return Math.round(fee * 100) / 100;
}
