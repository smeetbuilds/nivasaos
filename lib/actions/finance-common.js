import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const configuredUploadDir = process.env.NIVASA_UPLOAD_DIR;
export const uploadDirectory = configuredUploadDir
  ? path.resolve(/* turbopackIgnore: true */ configuredUploadDir)
  : path.join(process.cwd(), "storage", "uploads");

export function validDate(value, field, fallback = "") {
  const candidate = String(value || fallback || "").trim();
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) {
    throw new Error(`${field} must be a valid date`);
  }
  return candidate;
}

export async function saveProof(file) {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error("Proof file must be 5 MB or smaller");
  const allowed = new Map([
    ["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"], ["application/pdf", ".pdf"]
  ]);
  const ext = allowed.get(file.type);
  if (!ext) throw new Error("Proof must be JPG, PNG, WebP, or PDF");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (from, length) => String.fromCharCode(...bytes.slice(from, from + length));
  const valid =
    (ext === ".jpg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (ext === ".png" && bytes[0] === 0x89 && ascii(1, 3) === "PNG") ||
    (ext === ".webp" && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") ||
    (ext === ".pdf" && ascii(0, 5) === "%PDF-");
  if (!valid) throw new Error("The uploaded proof content does not match its file type");
  fs.mkdirSync(uploadDirectory, { recursive: true, mode: 0o700 });
  const filename = `${Date.now()}-${randomBytes(10).toString("hex")}${ext}`;
  const destination = path.join(uploadDirectory, filename);
  await Bun.write(destination, bytes);
  try { fs.chmodSync(destination, 0o600); } catch {}
  return filename;
}
