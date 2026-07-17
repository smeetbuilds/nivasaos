import "server-only";
import { all } from "@/lib/db";
import { permissionScopeSql } from "@/lib/permissions";
import { calculateLateFee } from "@/lib/billing-rules";

export { LATE_FEE_TYPES, calculateLateFee } from "@/lib/billing-rules";

export function eligibleLateFeeInvoices(user, propertyId = null) {
  const scope = permissionScopeSql(user, "billing.manage", "p");
  const filters = [
    scope.clause,
    "i.charge_type='rent'",
    "i.status NOT IN ('paid','void')",
    "i.amount > i.amount_paid",
    "bp.late_fee_type != 'none'",
    "bp.late_fee_value > 0",
    "date(i.due_date, '+' || bp.grace_days || ' days') < date('now')",
    `NOT EXISTS (
      SELECT 1 FROM invoices fee
      WHERE fee.source_invoice_id=i.id AND fee.charge_type='late_fee' AND fee.status!='void'
    )`
  ];
  const params = { ...scope.params };
  if (propertyId) {
    filters.push("p.id=$propertyId");
    params.propertyId = Number(propertyId);
  }
  return all(
    `SELECT i.id,i.property_id,i.lease_id,i.tenant_id,i.number,i.due_date,date(i.due_date, '+' || bp.grace_days || ' days') grace_ends,i.amount,i.amount_paid,
      (i.amount-i.amount_paid) balance,p.name property_name,p.currency,
      bp.grace_days,bp.late_fee_type,bp.late_fee_value,bp.late_fee_cap,
      t.full_name tenant_name,l.reference lease_reference,u.name unit_name
     FROM invoices i
     JOIN properties p ON p.id=i.property_id
     JOIN billing_policies bp ON bp.property_id=p.id
     LEFT JOIN tenants t ON t.id=i.tenant_id
     LEFT JOIN leases l ON l.id=i.lease_id
     LEFT JOIN units u ON u.id=l.unit_id
     WHERE ${filters.join(" AND ")}
     ORDER BY i.due_date,i.id`,
    params
  ).map((row) => ({ ...row, fee_amount: calculateLateFee(Number(row.balance), row) }))
    .filter((row) => row.fee_amount > 0);
}

export function lateFeeSummary(user, propertyId = null) {
  const rows = eligibleLateFeeInvoices(user, propertyId);
  const byCurrency = [...rows.reduce((map, row) => {
    map.set(row.currency, (map.get(row.currency) || 0) + Number(row.fee_amount));
    return map;
  }, new Map()).entries()].map(([currency, amount]) => ({ currency, amount }));
  return { rows, count: rows.length, byCurrency };
}
