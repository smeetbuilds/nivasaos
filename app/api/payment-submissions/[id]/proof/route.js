import path from "node:path";
import { canAccessProperty, requireUser } from "@/lib/auth";
import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const user = await requireUser();
  const { id } = await params;
  const submission = get("SELECT property_id,proof_path FROM payment_submissions WHERE id=$id", { id: Number(id) });
  if (!submission?.proof_path || !canAccessProperty(user, submission.property_id)) return new Response("Not found", { status: 404 });
  const safeName = path.basename(submission.proof_path);
  const root = process.env.NIVASA_UPLOAD_DIR ? path.resolve(process.env.NIVASA_UPLOAD_DIR) : path.join(process.cwd(), "storage", "uploads");
  const file = Bun.file(path.join(/* turbopackIgnore: true */ root, safeName));
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, { headers: { "Content-Type": file.type || "application/octet-stream", "Content-Disposition": `inline; filename="${safeName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" } });
}
