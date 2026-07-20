import fs from "node:fs";

const failures = [];
const dockerfile = fs.readFileSync("Dockerfile", "utf8");
const dockerignore = fs.readFileSync(".dockerignore", "utf8");
const nextConfig = fs.readFileSync("next.config.mjs", "utf8");
const containerGate = fs.readFileSync("scripts/container-gate.js", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const runtime = dockerfile.slice(dockerfile.indexOf("FROM oven/bun:1.3.0-alpine AS runner"));

if (!nextConfig.includes('output: "standalone"')) failures.push("next.config.mjs does not enable standalone output tracing");
for (const needle of [
  "FROM oven/bun:1.3.0-alpine AS base",
  "FROM oven/bun:1.3.0-alpine AS runner",
  "/app/.next/standalone ./",
  "/app/.next/static ./.next/static",
  "/app/public ./public",
  "/app/scripts/backup.js",
  "/app/scripts/restore.js",
  "/app/scripts/migrate.js",
  "/app/scripts/create-install-token.js",
  "/app/lib/schema ./lib/schema",
  "USER bun",
  'CMD ["bun", "run", "start"]'
]) if (!dockerfile.includes(needle)) failures.push(`Dockerfile: missing ${needle}`);

for (const forbidden of ["COPY --from=deps /app/node_modules ./node_modules", "COPY . .", "/app/app ./app", "/app/components ./components", "/app/scripts/verify-source.js"]) {
  if (runtime.includes(forbidden)) failures.push(`Docker runtime stage contains development payload: ${forbidden}`);
}
if (!runtime.includes("p.scripts={start:'bun server.js'")) failures.push("Docker runtime package is not reduced to standalone and operator commands");
if (packageJson.scripts?.migrate !== "bun run scripts/migrate.js") failures.push("package.json: migrate command is missing");
if (/^\.github\/?$/m.test(dockerignore)) failures.push(".dockerignore excludes governance files required by the builder release verifier");
for (const requiredIgnore of [".git", "node_modules", "artifacts", "storage/*.sqlite"]) if (!dockerignore.split(/\r?\n/).includes(requiredIgnore)) failures.push(`.dockerignore: missing ${requiredIgnore}`);

for (const needle of [
  "NIVASA_MAX_IMAGE_BYTES",
  "350 * 1024 * 1024",
  'image", "inspect"',
  "schema_migrations",
  'bun", "run", "migrate"',
  'bun", "run", "backup"',
  "/app/server.js",
  "/app/scripts/verify-source.js",
  "Runtime image is",
  "Migration ledger is incomplete"
]) if (!containerGate.includes(needle)) failures.push(`scripts/container-gate.js: missing ${needle}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Standalone Next output, pinned Alpine Bun build/runtime, production-only copy boundaries, governance-aware build context, image-size ceiling, operator commands, migration ledger, and non-root container contract are verified.");
