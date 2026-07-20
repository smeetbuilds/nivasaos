import path from "node:path";
import { requireUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { canDeliverFinancialProof } from "@/lib/financial-proof-authorization";
import { localFileResponse } from "@/lib/local-files";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const user = await requireUser();
  const { id } = await params;
  const payment = get("SELECT property_id,proof_path FROM payments WHERE id=$id", { id: Number(id) });
  const allowed = canDeliverFinancialProof(
    payment,
    "payments.manage",
    (permission, propertyId) => hasPermission(user, permission, propertyId)
  );
  if (!allowed) return new Response("Not found", { status: 404 });
  return localFileResponse({
    filePath: payment.proof_path,
    originalName: path.basename(payment.proof_path)
  });
}
