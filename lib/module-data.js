import "server-only";
import { all, get } from "@/lib/db";
import { propertyScopeSql } from "@/lib/auth";
import { moduleById } from "@/lib/modules/catalog";

export function moduleDashboardData(user) {
  const scope = propertyScopeSql(user, "p");
  const rows = all(
    `SELECT p.module_id,COUNT(*) property_count,
      SUM(CASE WHEN p.status='active' THEN 1 ELSE 0 END) active_properties,
      (SELECT COUNT(*) FROM rentable_spaces rs JOIN properties p2 ON p2.id=rs.property_id WHERE p2.module_id=p.module_id AND rs.status!='inactive') spaces,
      (SELECT COUNT(*) FROM rentable_spaces rs JOIN properties p2 ON p2.id=rs.property_id WHERE p2.module_id=p.module_id AND rs.status='occupied') occupied_spaces,
      (SELECT COUNT(*) FROM lease_services ls JOIN properties p2 ON p2.id=ls.property_id WHERE p2.module_id=p.module_id AND ls.status='active') active_services,
      (SELECT COUNT(*) FROM visitor_entries ve JOIN properties p2 ON p2.id=ve.property_id WHERE p2.module_id=p.module_id AND ve.status='checked_in') visitors_inside,
      (SELECT COUNT(*) FROM leases l JOIN properties p2 ON p2.id=l.property_id LEFT JOIN commercial_lease_profiles clp ON clp.lease_id=l.id WHERE p2.module_id=p.module_id AND l.status='active' AND clp.id IS NULL) missing_commercial_profiles
     FROM properties p WHERE ${scope.clause} GROUP BY p.module_id ORDER BY property_count DESC,p.module_id`,
    scope.params
  );
  return rows.map((row) => ({ ...row, module: moduleById(row.module_id) }));
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
