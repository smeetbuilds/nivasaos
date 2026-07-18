import fs from "node:fs";
import path from "node:path";
import { get } from "@/lib/db";
import { uploadDirectory } from "@/lib/actions/finance-common";
import { BRAND_ASSET_DEFINITIONS } from "@/lib/branding";

export const dynamic = "force-dynamic";

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function customAssetPath(value) {
  const normalized = String(value || "").replaceAll("\\", "/");
  if (!/^branding\/[a-z0-9-]+\.(png|jpe?g|webp|ico)$/.test(normalized)) return null;
  const brandingRoot = path.resolve(uploadDirectory, "branding");
  const candidate = path.resolve(uploadDirectory, normalized);
  if (candidate !== brandingRoot && !candidate.startsWith(`${brandingRoot}${path.sep}`)) return null;
  return candidate;
}

export async function GET(request, { params }) {
  const { asset } = await params;
  const definition = BRAND_ASSET_DEFINITIONS[asset];
  if (!definition) return new Response("Brand asset not found", { status: 404 });

  let stored = "";
  try { stored = get("SELECT value FROM settings WHERE key=$key", { key: definition.setting })?.value || ""; } catch {}
  const filePath = customAssetPath(stored);
  if (!filePath || !fs.existsSync(filePath)) return Response.redirect(new URL(definition.fallback, request.url), 307);

  const extension = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) return Response.redirect(new URL(definition.fallback, request.url), 307);

  return new Response(fs.readFileSync(filePath), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="${path.basename(filePath)}"`,
      "X-Content-Type-Options": "nosniff"
    }
  });
}
