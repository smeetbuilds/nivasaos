import fs from "node:fs";
import path from "node:path";
import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

const configuredUploadDirectory = process.env.NIVASA_UPLOAD_DIR;
const uploadDirectory = configuredUploadDirectory
  ? path.resolve(/* turbopackIgnore: true */ configuredUploadDirectory)
  : path.join(process.cwd(), "storage", "uploads");

function deploymentMetadata() {
  const commit = String(process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "").trim();
  return {
    deployment: process.env.RENDER_SERVICE_ID ? "render" : "self-hosted",
    release: commit ? commit.slice(0, 12) : "unversioned"
  };
}

export async function GET() {
  const startedAt = Date.now();
  try {
    fs.mkdirSync(uploadDirectory, { recursive: true, mode: 0o700 });
    fs.accessSync(uploadDirectory, fs.constants.R_OK | fs.constants.W_OK);
    const database = get("SELECT 1 AS healthy");
    if (Number(database?.healthy) !== 1) throw new Error("Database probe failed");

    return Response.json({
      status: "ok",
      database: "reachable",
      storage: "writable",
      ...deploymentMetadata(),
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("NivasaOS health check failed", error);
    return Response.json({
      status: "unhealthy",
      ...deploymentMetadata(),
      timestamp: new Date().toISOString()
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
