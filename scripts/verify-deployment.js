import fs from "node:fs";
import { normalizedRuntimeEnvironment, runtimeValidationErrors } from "../lib/runtime-config.js";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const requiredFiles = [
  "render.yaml",
  "DEPLOYMENT.md",
  "docs/RENDER.md",
  "docs/SELF_HOSTING.md",
  "Dockerfile",
  "scripts/start-container.js",
  "lib/runtime-config.js"
];
for (const file of requiredFiles) if (!fs.existsSync(file)) failures.push(`${file}: missing`);

if (!failures.length) {
  const render = read("render.yaml");
  const dockerfile = read("Dockerfile");
  const start = read("scripts/start-container.js");
  const renderDocs = read("docs/RENDER.md");
  const selfHostDocs = read("docs/SELF_HOSTING.md");
  const deployment = read("DEPLOYMENT.md");

  for (const needle of [
    "runtime: docker",
    "plan: starter",
    "numInstances: 1",
    "autoDeployTrigger:",
    "off",
    "healthCheckPath: /api/health",
    "mountPath: /app/storage",
    "sizeGB: 1",
    "value: /app/storage/nivasaos.sqlite",
    "value: /app/storage/uploads",
    "value: /app/storage/backups",
    "sync: false"
  ]) if (!render.includes(needle)) failures.push(`render.yaml: missing ${needle}`);
  if (render.includes("plan: free")) failures.push("render.yaml: SQLite deployment must not use Render Free");
  if (render.includes("NIVASA_TRUST_PROXY_HEADERS")) failures.push("render.yaml: must not trust proxy client headers that Render does not overwrite into the NivasaOS header contract");

  for (const needle of [
    "/app/scripts/start-container.js",
    "/app/lib/runtime-config.js",
    "p.scripts={start:'bun run scripts/start-container.js'",
    "process.env.PORT||'3000'",
    'CMD ["bun", "run", "start"]'
  ]) if (!dockerfile.includes(needle)) failures.push(`Dockerfile: missing ${needle}`);

  for (const needle of [
    "assertRuntimeEnvironment",
    "installationExists",
    "normalizedRuntimeEnvironment",
    'Bun.spawn([bun, "run", "scripts/migrate.js"]',
    'Bun.spawn([bun, "server.js"]'
  ]) if (!start.includes(needle)) failures.push(`scripts/start-container.js: missing ${needle}`);

  const renderEnv = normalizedRuntimeEnvironment({
    RENDER: "true",
    RENDER_EXTERNAL_URL: "https://nivasaos-example.onrender.com",
    NIVASA_INSTALL_TOKEN: "render-install-token-32-characters",
    PORT: "10000"
  });
  if (renderEnv.NIVASA_PUBLIC_URL !== "https://nivasaos-example.onrender.com") failures.push("Render external URL is not normalized into NIVASA_PUBLIC_URL");
  if (renderEnv.NEXT_PUBLIC_APP_URL !== "https://nivasaos-example.onrender.com") failures.push("Render external URL is not normalized into NEXT_PUBLIC_APP_URL");
  if (renderEnv.NIVASA_DB_PATH !== "/app/storage/nivasaos.sqlite") failures.push("Render database path is not persistent by default");
  if (renderEnv.NIVASA_UPLOAD_DIR !== "/app/storage/uploads") failures.push("Render upload path is not persistent by default");
  if (renderEnv.NIVASA_BACKUP_DIR !== "/app/storage/backups") failures.push("Render backup path is not persistent by default");
  if (runtimeValidationErrors(renderEnv, { installed: false }).length) failures.push("Valid fresh Render runtime configuration is rejected");

  const customDomain = normalizedRuntimeEnvironment({
    RENDER: "true",
    RENDER_EXTERNAL_URL: "https://nivasaos-example.onrender.com",
    NIVASA_PUBLIC_URL: "https://property.example.com",
    NIVASA_INSTALL_TOKEN: "render-install-token-32-characters"
  });
  if (customDomain.NIVASA_PUBLIC_URL !== "https://property.example.com") failures.push("Explicit custom domain does not override Render's default URL");

  for (const needle of [
    "Free web-service plan does not support persistent disks",
    "exactly one service instance",
    "autoDeployTrigger: off",
    "pre-deploy instances cannot access the attached persistent disk",
    "NIVASA_PUBLIC_URL=https://property.example.com",
    "bun run backup",
    "bun run restore"
  ]) if (!renderDocs.includes(needle)) failures.push(`docs/RENDER.md: missing ${needle}`);

  for (const needle of [
    "compose.production.yml",
    "openssl rand -hex 32",
    "docker compose --env-file .env.production -f compose.production.yml",
    "remove `NIVASA_INSTALL_TOKEN`",
    "bun run backup",
    "bun run restore",
    "PHP/cPanel shared hosting is not sufficient"
  ]) if (!selfHostDocs.includes(needle)) failures.push(`docs/SELF_HOSTING.md: missing ${needle}`);

  for (const needle of ["render.com/deploy?repo=https://github.com/smeetbuilds/nivasaos", "docs/RENDER.md", "docs/SELF_HOSTING.md", "Vercel", "PHP-only shared hosting"]) {
    if (!deployment.includes(needle)) failures.push(`DEPLOYMENT.md: missing ${needle}`);
  }
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Render Blueprint, persistent storage, runtime URL/path normalization, startup migration, one-instance safety, self-hosting, update, backup, and restore deployment contracts are verified.");
