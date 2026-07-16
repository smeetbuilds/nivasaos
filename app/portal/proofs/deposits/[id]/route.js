import path from "node:path";
import { requireTenant } from "@/lib/tenant-auth";
import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const tenant = await requireTenant();
  const { id } = await params;
  const item = get(
    `SELECT dt.proof_path FROM deposit_transactions dt
     WHERE dt.id=$id AND (
       dt.tenant_id=$tenantId OR
       (dt.tenant_id IS NULL AND EXISTS (SELECT 1 FROM lease_tenants lt WHERE lt.lease_id=dt.lease_id AND lt.tenant_id=$tenantId))
     )`,
    { id: Number(id), tenantId: tenant.tenant_id }
  );
  if (!item?.proof_path) return new Response("Not found", { status: 404 });
  const safeName = path.basename(item.proof_path);
  const root = process.env.NIVASA_UPLOAD_DIR ? path.resolve(process.env.NIVASA_UPLOAD_DIR) : path.join(process.cwd(), "storage", "uploads");
  const file = Bun.file(path.join(/* turbopackIgnore: true */ root, safeName));
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, { headers: { "Content-Type": file.type || "application/octet-stream", "Content-Disposition": `inline; filename="${safeName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" } });
}
