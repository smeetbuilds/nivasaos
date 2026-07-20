const FINANCIAL_PROOF_PERMISSIONS = new Set(["payments.manage", "deposits.manage"]);

export function canDeliverFinancialProof(record, permission, permissionCheck) {
  const propertyId = Number(record?.property_id || 0);
  if (!record?.proof_path || !Number.isInteger(propertyId) || propertyId <= 0) return false;
  if (!FINANCIAL_PROOF_PERMISSIONS.has(permission) || typeof permissionCheck !== "function") return false;
  return Boolean(permissionCheck(permission, propertyId));
}
