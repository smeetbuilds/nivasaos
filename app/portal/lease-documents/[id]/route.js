import { requireTenant } from "@/lib/tenant-auth";
import { get } from "@/lib/db";
import { localFileResponse } from "@/lib/local-files";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const tenant = await requireTenant();
  const { id } = await params;
  const document = get(
    `SELECT ld.file_path,ld.original_name,ld.mime_type
     FROM lease_documents ld
     JOIN lease_tenants lt ON lt.lease_id=ld.lease_id
     WHERE ld.id=$id AND lt.tenant_id=$tenantId AND ld.visibility='tenant' AND ld.archived_at IS NULL`,
    { id: Number(id), tenantId: tenant.tenant_id }
  );
  if (!document) return new Response("Not found", { status: 404 });
  return localFileResponse({ filePath: document.file_path, originalName: document.original_name, mimeType: document.mime_type });
}
