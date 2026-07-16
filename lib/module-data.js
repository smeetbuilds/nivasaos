import "server-only";
import { all, get } from "@/lib/db";
import { propertyScopeSql } from "@/lib/auth";
import { moduleById } from "@/lib/modules/catalog";

function groupedCounts(rows, key = "module_id") {
  return new Map(rows.map((row) => [row[key], row]));
}

export function moduleDashboardData(user) {
  const scope = propertyScopeSql(user, "p");
  const properties = all(`SELECT p.id,p.module_id,p.status FROM properties p WHERE ${scope.clause} ORDER BY p.module_id,p.id`, scope.params);
  if (!properties.length) return [];
  const ids = properties.map((property) => Number(property.id));
  const placeholders = ids.map(() => "?").join(",");
  const base = new Map();
  for (const property of properties) {
    const moduleId = property.module_id || "residential";
    const row = base.get(moduleId) || { module_id: moduleId, property_count: 0, active_properties: 0, spaces: 0, occupied_spaces: 0, active_services: 0, visitors_inside: 0, missing_commercial_profiles: 0 };
    row.property_count += 1;
    if (property.status === "active") row.active_properties += 1;
    base.set(moduleId, row);
  }

  const spaces = groupedCounts(all(
    `SELECT p.module_id,COUNT(*) spaces,SUM(CASE WHEN rs.status='occupied' THEN 1 ELSE 0 END) occupied_spaces
     FROM rentable_spaces rs JOIN properties p ON p.id=rs.property_id
     WHERE rs.property_id IN (${placeholders}) AND rs.status!='inactive' GROUP BY p.module_id`,
    ids
  ));
  const services = groupedCounts(all(
    `SELECT p.module_id,COUNT(*) active_services FROM lease_services ls JOIN properties p ON p.id=ls.property_id
     WHERE ls.property_id IN (${placeholders}) AND ls.status='active' GROUP BY p.module_id`,
    ids
  ));
  const visitors = groupedCounts(all(
    `SELECT p.module_id,COUNT(*) visitors_inside FROM visitor_entries ve JOIN properties p ON p.id=ve.property_id
     WHERE ve.property_id IN (${placeholders}) AND ve.status='checked_in' GROUP BY p.module_id`,
    ids
  ));
  const commercial = groupedCounts(all(
    `SELECT p.module_id,COUNT(*) missing_commercial_profiles FROM leases l JOIN properties p ON p.id=l.property_id
     LEFT JOIN commercial_lease_profiles clp ON clp.lease_id=l.id
     WHERE l.property_id IN (${placeholders}) AND l.status='active' AND clp.id IS NULL AND p.module_id='commercial'
     GROUP BY p.module_id`,
    ids
  ));

  return [...base.values()].map((row) => ({
    ...row,
    spaces: Number(spaces.get(row.module_id)?.spaces || 0),
    occupied_spaces: Number(spaces.get(row.module_id)?.occupied_spaces || 0),
    active_services: Number(services.get(row.module_id)?.active_services || 0),
    visitors_inside: Number(visitors.get(row.module_id)?.visitors_inside || 0),
    missing_commercial_profiles: Number(commercial.get(row.module_id)?.missing_commercial_profiles || 0),
    module: moduleById(row.module_id)
  })).sort((a, b) => b.property_count - a.property_count || a.module.label.localeCompare(b.module.label));
}

export function portalModuleContext(tenantId) {
  const row = get(
    `SELECT p.module_id,p.name property_name,p.currency FROM tenants t JOIN properties p ON p.id=t.property_id WHERE t.id=$tenantId`,
    { tenantId: Number(tenantId) }
  );
  return { ...row, module: moduleById(row?.module_id) };
}

export function portalSpaceData(tenantId) {
  return all(
    `SELECT sa.*,rs.code,rs.space_type,rs.gender_policy,p.name property_name,p.currency,u.name unit_name,l.reference lease_reference
     FROM space_allocations sa JOIN rentable_spaces rs ON rs.id=sa.space_id JOIN properties p ON p.id=sa.property_id
     JOIN units u ON u.id=rs.unit_id JOIN leases l ON l.id=sa.lease_id
     WHERE sa.tenant_id=$tenantId ORDER BY CASE sa.status WHEN 'active' THEN 0 ELSE 1 END,sa.start_date DESC,sa.id DESC`,
    { tenantId: Number(tenantId) }
  );
}

export function portalServicesData(tenantId) {
  return all(
    `SELECT ls.*,sc.name,sc.category,sc.description,sc.billing_frequency,sc.amount default_amount,
      p.name property_name,p.currency,l.reference lease_reference,u.name unit_name,
      (SELECT i.number FROM service_billing_runs sbr JOIN invoices i ON i.id=sbr.invoice_id WHERE sbr.subscription_id=ls.id ORDER BY sbr.created_at DESC LIMIT 1) latest_invoice
     FROM lease_services ls JOIN service_catalog sc ON sc.id=ls.service_id JOIN properties p ON p.id=ls.property_id
     JOIN leases l ON l.id=ls.lease_id JOIN units u ON u.id=l.unit_id
     WHERE ls.tenant_id=$tenantId OR (ls.tenant_id IS NULL AND EXISTS (SELECT 1 FROM lease_tenants lt WHERE lt.lease_id=ls.lease_id AND lt.tenant_id=$tenantId))
     ORDER BY CASE ls.status WHEN 'active' THEN 0 ELSE 1 END,sc.name`,
    { tenantId: Number(tenantId) }
  );
}

export function portalVisitorsData(tenantId) {
  const leases = all(
    `SELECT l.id,l.reference,p.name property_name,u.name unit_name FROM leases l JOIN lease_tenants lt ON lt.lease_id=l.id
     JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id
     WHERE lt.tenant_id=$tenantId AND l.status='active' ORDER BY p.name,u.name`,
    { tenantId: Number(tenantId) }
  );
  const visitors = all(
    `SELECT ve.*,p.name property_name,l.reference lease_reference,u.name unit_name
     FROM visitor_entries ve JOIN properties p ON p.id=ve.property_id LEFT JOIN leases l ON l.id=ve.lease_id LEFT JOIN units u ON u.id=l.unit_id
     WHERE ve.tenant_id=$tenantId ORDER BY ve.expected_at DESC,ve.id DESC`,
    { tenantId: Number(tenantId) }
  );
  return { leases, visitors };
}

export function portalCommercialData(tenantId) {
  return all(
    `SELECT clp.*,l.reference lease_reference,l.status lease_status,p.name property_name,p.currency,u.name unit_name
     FROM commercial_lease_profiles clp JOIN leases l ON l.id=clp.lease_id JOIN lease_tenants lt ON lt.lease_id=l.id
     JOIN properties p ON p.id=clp.property_id JOIN units u ON u.id=l.unit_id
     WHERE lt.tenant_id=$tenantId ORDER BY CASE l.status WHEN 'active' THEN 0 ELSE 1 END,l.start_date DESC`,
    { tenantId: Number(tenantId) }
  );
}
