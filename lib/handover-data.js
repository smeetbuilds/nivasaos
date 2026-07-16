import "server-only";
import { all } from "@/lib/db";

export function portalHandoverData(tenantId) {
  const documents = all(
    `SELECT ld.id,ld.lease_id,ld.inspection_id,ld.title,ld.document_type,ld.original_name,ld.mime_type,ld.file_size,ld.notes,ld.created_at,
      p.name property_name,l.reference lease_reference,u.name unit_name
     FROM lease_documents ld
     JOIN lease_tenants lt ON lt.lease_id=ld.lease_id
     JOIN properties p ON p.id=ld.property_id
     JOIN leases l ON l.id=ld.lease_id
     JOIN units u ON u.id=l.unit_id
     WHERE lt.tenant_id=$tenantId AND ld.visibility='tenant' AND ld.archived_at IS NULL
     ORDER BY ld.created_at DESC,ld.id DESC`,
    { tenantId: Number(tenantId) }
  );
  const inspections = all(
    `SELECT pi.*,p.name property_name,p.currency,l.reference lease_reference,u.name unit_name,
      COALESCE((SELECT SUM(ii.charge_amount) FROM inspection_items ii WHERE ii.inspection_id=pi.id),0) assessed_charge,
      (SELECT COUNT(*) FROM inspection_items ii WHERE ii.inspection_id=pi.id) item_count,
      ia.acknowledged_at,ia.tenant_note acknowledgement_note
     FROM property_inspections pi
     JOIN lease_tenants lt ON lt.lease_id=pi.lease_id
     JOIN properties p ON p.id=pi.property_id
     JOIN leases l ON l.id=pi.lease_id
     JOIN units u ON u.id=l.unit_id
     LEFT JOIN inspection_acknowledgements ia ON ia.inspection_id=pi.id AND ia.tenant_id=$tenantId
     WHERE lt.tenant_id=$tenantId AND pi.status!='draft'
     ORDER BY pi.scheduled_for DESC,pi.id DESC`,
    { tenantId: Number(tenantId) }
  );
  const inspectionIds = inspections.map((item) => Number(item.id));
  const items = inspectionIds.length ? all(
    `SELECT * FROM inspection_items WHERE inspection_id IN (${inspectionIds.map(() => "?").join(",")}) ORDER BY inspection_id,area,item_name,id`,
    inspectionIds
  ) : [];
  const itemsByInspection = items.reduce((map, item) => {
    const key = Number(item.inspection_id);
    if (!map[key]) map[key] = [];
    map[key].push(item);
    return map;
  }, {});
  const keys = all(
    `SELECT kt.*,p.name property_name,l.reference lease_reference,u.name unit_name,attributed.full_name attributed_tenant
     FROM lease_key_transactions kt
     JOIN lease_tenants lt ON lt.lease_id=kt.lease_id
     JOIN properties p ON p.id=kt.property_id
     JOIN leases l ON l.id=kt.lease_id
     JOIN units u ON u.id=l.unit_id
     LEFT JOIN tenants attributed ON attributed.id=kt.tenant_id
     WHERE lt.tenant_id=$tenantId
     ORDER BY kt.transacted_at DESC,kt.id DESC`,
    { tenantId: Number(tenantId) }
  );
  return { documents, inspections, itemsByInspection, keys };
}
