import path from "node:path";
import { requireUser,canAccessProperty } from "@/lib/auth";
import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request,{params}){
  const user=await requireUser();
  const {id}=await params;
  const payment=get("SELECT property_id,proof_path FROM payments WHERE id=$id",{id:Number(id)});
  if(!payment||!payment.proof_path||!canAccessProperty(user,payment.property_id)) return new Response("Not found",{status:404});
  const safeName=path.basename(payment.proof_path);
  const uploadRoot=process.env.NIVASA_UPLOAD_DIR ? path.resolve(process.env.NIVASA_UPLOAD_DIR) : path.join(process.cwd(),"storage","uploads");
  const fullPath=path.join(/* turbopackIgnore: true */ uploadRoot,safeName);
  const file=Bun.file(fullPath);
  if(!(await file.exists())) return new Response("Not found",{status:404});
  return new Response(file,{headers:{"Content-Type":file.type||"application/octet-stream","Content-Disposition":`inline; filename="${safeName}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox; default-src 'none'; style-src 'unsafe-inline'"}});
}
