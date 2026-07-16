import { canAccessProperty, requireUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { localFileResponse } from "@/lib/local-files";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const user = await requireUser();
  const { id } = await params;
  const document = get(
    "SELECT property_id,file_path,original_name,mime_type FROM lease_documents WHERE id=$id",
    { id: Number(id) }
  );
  if (!document || !canAccessProperty(user, document.property_id)) return new Response("Not found", { status: 404 });
  return localFileResponse({ filePath: document.file_path, originalName: document.original_name, mimeType: document.mime_type });
}
