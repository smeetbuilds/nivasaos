import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = ["package.json", "bun.lock", "next.config.mjs", "app/layout.js", "Dockerfile"];
const failures = required.filter((file) => !fs.existsSync(path.join(root, file))).map((file) => `${file} is missing`);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const nextPackage = JSON.parse(fs.readFileSync(path.join(root, "node_modules/next/package.json"), "utf8"));
const commit = String(process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "").trim();
const branch = String(process.env.RENDER_GIT_BRANCH || process.env.GIT_BRANCH || "").trim();
const externalHostname = String(process.env.RENDER_EXTERNAL_HOSTNAME || "").trim();
const externalUrl = String(process.env.NIVASA_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
const buildDatabase = String(process.env.NIVASA_DB_PATH || "").trim();
const buildUploads = String(process.env.NIVASA_UPLOAD_DIR || "").trim();
const buildBackups = String(process.env.NIVASA_BACKUP_DIR || "").trim();

if (packageJson.dependencies?.next !== nextPackage.version) failures.push(`Next.js package mismatch: package.json=${packageJson.dependencies?.next || "missing"}, installed=${nextPackage.version}`);
if (!String(packageJson.scripts?.build || "").includes("next build --webpack")) failures.push("Production build must remain pinned to the reviewed Webpack path");
if (externalUrl) {
  try {
    const parsed = new URL(externalUrl);
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) failures.push("Configured build URL must use HTTPS");
    if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) failures.push("Configured build URL must contain only scheme and host");
  } catch {
    failures.push("Configured build URL is not a valid absolute URL");
  }
}
for (const [label, value] of [["database", buildDatabase], ["uploads", buildUploads], ["backups", buildBackups]]) {
  if (value && value.startsWith("/app/storage")) failures.push(`Build-time ${label} path points at production storage instead of disposable build storage`);
}

const summary = {
  phase: "preflight",
  runtime: `Bun ${Bun.version}`,
  platform: `${process.platform}/${process.arch}`,
  next: nextPackage.version,
  commit: commit ? commit.slice(0, 12) : "unavailable",
  branch: branch || "unavailable",
  renderHostname: externalHostname || "unavailable",
  canonicalUrl: externalUrl || "runtime-resolved",
  buildDatabase: buildDatabase || "default",
  buildUploads: buildUploads || "default",
  buildBackups: buildBackups || "default"
};
console.log(`[nivasa-build] ${JSON.stringify(summary)}`);

if (failures.length) {
  console.error("[nivasa-build] phase=preflight status=failed");
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}

console.log("[nivasa-build] phase=preflight status=passed; starting Next.js compilation in the following Docker layer");
