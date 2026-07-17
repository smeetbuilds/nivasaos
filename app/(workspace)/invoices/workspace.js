import "server-only";
import { all, get } from "@/lib/db";
import { lateFeeSummary } from "@/lib/billing";
import { money, today } from "@/lib/format";
import { extensions } from "@/lib/extensions";
import { hasPermission, permissionScopeSql } from "@/lib/permissions";

const allowedStatuses = new Set(["all", "open", "overdue", "issued", "part_paid", "paid", "draft", "void"]);
const allowedCharges = new Set(["all", "rent", "late_fee", "manual"]);

export function loadInvoiceWorkspace(user, query) {
  const scope = permissionScopeSql(user, "billing.manage", "p");
  const properties = all(`SELECT p.* FROM properties p WHERE ${scope.clause} ORDER BY p.name`, scope.params);
  const requestedPropertyId = Number(query?.property || 0) || null;
  const propertyId = requestedPropertyId;
  const status = allowedStatuses.has(String(query?.status || "all")) ? String(query?.status || "all") : "all";
  const charge = allowedCharges.has(String(query?.charge || "all")) ? String(query?.charge || "all") : "all";
  const search = String(query?.search || "").trim().slice(0, 100);
  const filters = [scope.clause];
  const params = { ...scope.params };
  if (propertyId) {
    if (properties.some((property) => Number(property.id) === propertyId)) {
      filters.push("p.id=$filterPropertyId");
      params.filterPropertyId = propertyId;
    } else filters.push("0=1");
  }
  if (status === "open") filters.push("i.status NOT IN ('paid','void')");
  else if (status === "overdue") filters.push("i.status NOT IN ('paid','void') AND i.due_date<date('now')");
  else if (status !== "all") { filters.push("i.status=$filterStatus"); params.filterStatus = status; }
  if (charge !== "all") { filters.push("i.charge_type=$filterCharge"); params.filterCharge = charge; }
  if (search) {
    filters.push("(i.number LIKE $search OR i.description LIKE $search OR source.number LIKE $search OR t.full_name LIKE $search OR l.reference LIKE $search OR u.name LIKE $search)");
    params.search = `%${search}%`;
  }
  const rows = all(
    `SELECT i.*,p.name property_name,p.currency,t.full_name tenant_name,t.phone,
      l.reference lease_reference,u.name unit_name,source.number source_invoice_number
     FROM invoices i JOIN properties p ON p.id=i.property_id
     LEFT JOIN tenants t ON t.id=i.tenant_id
     LEFT JOIN leases l ON l.id=i.lease_id
     LEFT JOIN units u ON u.id=l.unit_id
     LEFT JOIN invoices source ON source.id=i.source_invoice_id
     WHERE ${filters.join(" AND ")}
     ORDER BY CASE WHEN i.status NOT IN ('paid','void') AND i.due_date<date('now') THEN 0 ELSE 1 END,i.due_date DESC,i.created_at DESC`,
    params
  ).map((row) => ({ ...row, canManageBilling: hasPermission(user, "billing.manage", row.property_id) }));
  const leases = all(`SELECT l.id,l.reference,l.property_id,p.name property_name,u.name unit_name,l.monthly_rent FROM leases l JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id WHERE ${scope.clause} AND l.status='active' ORDER BY p.name,u.name`, scope.params);
  const tenants = all(`SELECT t.id,t.full_name,t.property_id,p.name property_name FROM tenants t JOIN properties p ON p.id=t.property_id WHERE ${scope.clause} AND t.status='active' ORDER BY p.name,t.full_name`, scope.params);
  const template = get("SELECT value FROM settings WHERE key='whatsapp_template'")?.value || "Hello {tenant}, invoice {invoice} has a balance of {balance} due on {due_date}.";
  const currentPeriod = today().slice(0, 7);
  const openCount = rows.filter((row) => !["paid", "void"].includes(row.status)).length;
  const overdueCount = rows.filter((row) => !["paid", "void"].includes(row.status) && row.due_date < today()).length;
  const outstandingByCurrency = [...rows.reduce((map, row) => {
    if (!["paid", "void"].includes(row.status)) map.set(row.currency, (map.get(row.currency) || 0) + Number(row.amount) - Number(row.amount_paid));
    return map;
  }, new Map()).entries()].map(([currency, balance]) => ({ currency, balance }));
  const rentRunStatus = get(
    `SELECT COUNT(*) active,COALESCE(SUM(CASE WHEN EXISTS (
      SELECT 1 FROM invoices i WHERE i.lease_id=l.id AND i.rent_period=$period AND i.status!='void'
     ) THEN 1 ELSE 0 END),0) invoiced
     FROM leases l JOIN properties p ON p.id=l.property_id
     WHERE ${scope.clause} AND l.status='active' AND p.status='active'
       AND l.start_date <= date('now','start of month','+1 month','-1 day')
       AND (l.end_date IS NULL OR l.end_date >= date('now','start of month'))`,
    { ...scope.params, period: currentPeriod }
  ) || { active: 0, invoiced: 0 };
  const canManageBilling = properties.length > 0;
  const lateFees = canManageBilling ? lateFeeSummary(user) : { rows: [], count: 0, byCurrency: [] };
  return {
    properties, propertyId, status, charge, search, rows, leases, tenants, template,
    driver: extensions.notificationDrivers.get("whatsapp_link"), currentPeriod, openCount, overdueCount,
    outstandingByCurrency, rentRunStatus, canManageBilling, lateFees
  };
}
