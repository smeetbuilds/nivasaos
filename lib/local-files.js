import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const configuredUploadDir = process.env.NIVASA_UPLOAD_DIR;
export const localUploadDirectory = configuredUploadDir
  ? path.resolve(/* turbopackIgnore: true */ configuredUploadDir)
  : path.join(process.cwd(), "storage", "uploads");

const types = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"]
]);

function signatureMatches(bytes, ext) {
  const ascii = (from, length) => String.fromCharCode(...bytes.slice(from, from + length));
  return (ext === ".jpg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (ext === ".png" && bytes[0] === 0x89 && ascii(1, 3) === "PNG") ||
    (ext === ".webp" && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") ||
    (ext === ".pdf" && ascii(0, 5) === "%PDF-");
}

export async function saveLocalDocument(file, { required = true, maxBytes = 10 * 1024 * 1024 } = {}) {
  if (!file || typeof file === "string" || file.size === 0) {
    if (required) throw new Error("Select a PDF or image to upload");
    return null;
  }
  if (file.size > maxBytes) throw new Error(`File must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller`);
  const ext = types.get(file.type);
  if (!ext) throw new Error("File must be JPG, PNG, WebP, or PDF");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!signatureMatches(bytes, ext)) throw new Error("Uploaded file content does not match its file type");
  fs.mkdirSync(localUploadDirectory, { recursive: true, mode: 0o700 });
  const filename = `${Date.now()}-${randomBytes(12).toString("hex")}${ext}`;
  const destination = path.join(localUploadDirectory, filename);
  await Bun.write(destination, bytes);
  try { fs.chmodSync(destination, 0o600); } catch {}
  return {
    filename,
    originalName: String(file.name || `document${ext}`).replace(/[\r\n]/g, " ").slice(0, 240),
    mimeType: file.type,
    size: Number(file.size)
  };
}

export function removeLocalFile(filename) {
  if (!filename) return;
  try { fs.unlinkSync(path.join(localUploadDirectory, path.basename(filename))); } catch {}
}

function safeHeaderName(value) {
  return String(value || "document").replace(/[\r\n"\\]/g, "_").slice(0, 180) || "document";
}

export async function localFileResponse({ filePath, originalName, mimeType, disposition = "inline" }) {
  const safePath = path.basename(String(filePath || ""));
  if (!safePath) return new Response("Not found", { status: 404 });
  const file = Bun.file(path.join(/* turbopackIgnore: true */ localUploadDirectory, safePath));
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, {
    headers: {
      "Content-Type": mimeType || file.type || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${safeHeaderName(originalName || safePath)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      "Referrer-Policy": "no-referrer"
    }
  });
}
