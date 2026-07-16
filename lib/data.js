import "server-only";
import { all, get, scalar } from "@/lib/db";
import { propertyScopeSql } from "@/lib/auth";

export function accessibleProperties(user) {
  const scope = propertyScopeSql(user, "p");
  return all(`SELECT p.* FROM properties p WHERE ${scope.clause} ORDER BY p.name`, scope.params);
}

export function dashboardData(user) {
  const scope = propertyScopeSql(user, "p");
  const params = scope.params;
  const propertyJoin = `JOIN properties p ON p.id = x.property_id AND ${scope.clause}`;
  const totalProperties = scalar(`SELECT COUNT(*) FROM properties p WHERE ${scope.clause} AND p.status='active'`, params);
  const units = get(`SELECT COUNT(*) total, SUM(CASE WHEN x.status='available' THEN 1 ELSE 0 END) available, SUM(CASE WHEN x.status='occupied' THEN 1 ELSE 0 END) occupied FROM units x ${propertyJoin}`, params) || {};
  const moneyByCurrency = all(`SELECT p.currency, COALESCE(SUM(x.amount),0) billed, COALESCE(SUM(x.amount_paid),0) collected FROM invoices x ${propertyJoin} WHERE x.issue_date >= date('now','start of month') AND x.status != 'void' GROUP BY p.currency ORDER BY p.currency`, params);
  const overdueByCurrency = all(`SELECT p.currency, COUNT(*) count, COALESCE(SUM(x.amount-x.amount_paid),0) balance FROM invoices x ${propertyJoin} WHERE x.status NOT IN ('paid','void') AND x.due_date < date('now') GROUP BY p.currency ORDER BY p.currency`, params);
  const maintenance = scalar(`SELECT COUNT(*) FROM maintenance_tickets x ${propertyJoin} WHERE x.status != 'resolved'`, params);
  const recentInvoices = all(`SELECT x.*, t.full_name tenant_name, p.name property_name, p.currency FROM invoices x ${propertyJoin} LEFT JOIN tenants t ON t.id=x.tenant_id ORDER BY x.created_at DESC LIMIT 6`, params);
  const recentTickets = all(`SELECT x.*, p.name property_name, u.name unit_name FROM maintenance_tickets x ${propertyJoin} LEFT JOIN units u ON u.id=x.unit_id ORDER BY CASE x.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, x.updated_at DESC LIMIT 6`, params);
  const rentRun = get(
    `SELECT COUNT(*) active,
      COALESCE(SUM(CASE WHEN EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.lease_id=x.id AND i.rent_period=strftime('%Y-%m','now') AND i.status!='void'
      ) THEN 1 ELSE 0 END),0) invoiced
     FROM leases x ${propertyJoin}
     WHERE x.status='active' AND p.status='active'
       AND x.start_date <= date('now','start of month','+1 month','-1 day')
       AND (x.end_date IS NULL OR x.end_date >= date('now','start of month'))`,
    params
  ) || { active: 0, invoiced: 0 };
  const leaseExpiries = all(
    `SELECT x.id,x.reference,x.end_date,p.name property_name,u.name unit_name,
      GROUP_CONCAT(t.full_name, ', ') tenant_names
     FROM leases x ${propertyJoin}
     JOIN units u ON u.id=x.unit_id
     LEFT JOIN lease_tenants lt ON lt.lease_id=x.id
     LEFT JOIN tenants t ON t.id=lt.tenant_id
     WHERE x.status='active' AND x.end_date BETWEEN date('now') AND date('now','+45 days')
     GROUP BY x.id
     ORDER BY x.end_date
     LIMIT 6`,
    params
  );
  return { totalProperties, units, moneyByCurrency, overdueByCurrency, maintenance, recentInvoices, recentTickets, rentRun, leaseExpiries };
}

export function reportData(user, propertyId) {
  const scope = propertyScopeSql(user, "p");
  const filters = [`${scope.clause}`];
  const params = { ...scope.params };
  if (propertyId) {
    filters.push("p.id = $propertyId");
    params.propertyId = Number(propertyId);
  }
  const where = filters.join(" AND ");
  const occupancy = all(`SELECT p.name property_name, p.currency, COUNT(u.id) total_units, SUM(CASE WHEN u.status='occupied' THEN 1 ELSE 0 END) occupied, SUM(CASE WHEN u.status='available' THEN 1 ELSE 0 END) available, COALESCE(SUM(CASE WHEN u.status='occupied' THEN u.monthly_rate ELSE 0 END),0) occupied_value FROM properties p LEFT JOIN units u ON u.property_id=p.id WHERE ${where} GROUP BY p.id ORDER BY p.name`, params);
  const arrears = all(`SELECT i.number, p.name property_name, p.currency, t.full_name tenant_name, i.due_date, i.amount, i.amount_paid, (i.amount-i.amount_paid) balance FROM invoices i JOIN properties p ON p.id=i.property_id LEFT JOIN tenants t ON t.id=i.tenant_id WHERE ${where} AND i.status NOT IN ('paid','void') AND i.due_date < date('now') ORDER BY i.due_date`, params);
  const collections = all(`SELECT substr(pay.paid_at,1,7) month, p.currency, SUM(pay.amount) total FROM payments pay JOIN properties p ON p.id=pay.property_id WHERE ${where} AND pay.paid_at >= date('now','-11 months','start of month') GROUP BY month,p.currency ORDER BY month`, params);
  return { occupancy, arrears, collections };
}
