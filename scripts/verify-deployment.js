import fs from "node:fs";
import { normalizedRuntimeEnvironment, runtimeValidationErrors } from "../lib/runtime-config.js";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const requiredFiles = [
  "render.yaml",
  "README.md",
  "docs/DEPLOYMENT.md",
  "docs/BACKUPS.md",
  ".env.production.example",
  "Dockerfile",
  "next.config.mjs",
  "scripts/start-container.js",
  "lib/runtime-config.js"
];
for (const file of requiredFiles) if (!fs.existsSync(file)) failures.push(`${file}: missing`);

if (!failures.length) {
  const render = read("render.yaml");
  const readme = read("README.md");
  const deploymentDocs = read("docs/DEPLOYMENT.md");
  const backupDocs = read("docs/BACKUPS.md");
  const productionEnv = read(".env.production.example");
  const dockerfile = read("Dockerfile");
  const nextConfig = read("next.config.mjs");
  const start = read("scripts/start-container.js");

  for (const needle of [
    "type: web",
    "runtime: docker",
    "plan: starter",
    "numInstances: 1",
    'autoDeployTrigger: "off"',
    "healthCheckPath: /api/health",
    "dockerfilePath: ./Dockerfile",
    "dockerContext: .",
    "mountPath: /app/storage",
    "sizeGB: 1",
    "value: /app/storage/nivasaos.sqlite",
    "value: /app/storage/uploads",
    "value: /app/storage/backups",
    "sync: false"
  ]) if (!render.includes(needle)) failures.push(`render.yaml: missing ${needle}`);
  if (render.includes("plan: free")) failures.push("render.yaml: SQLite deployment must not use Render Free");
  if (render.includes("NIVASA_TRUST_PROXY_HEADERS")) failures.push("render.yaml: must not trust proxy client headers that Render does not overwrite into the NivasaOS header contract");
  if (render.includes("preDeployCommand")) failures.push("render.yaml: disk migrations must not run in a pre-deploy instance without disk access");

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

  for (const needle of ["RENDER_EXTERNAL_HOSTNAME", "managedPlatformOrigins", "allowedOrigins: serverActionOrigins"]) {
    if (!nextConfig.includes(needle)) failures.push(`next.config.mjs: missing ${needle}`);
  }

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
    "Render Blueprint deployment",
    "persistent disk requires a paid Render web-service instance",
    "Run exactly **one** NivasaOS application instance",
    "automatic deployment to `off`",
    "cannot be accessed by build or pre-deploy instances",
    "NIVASA_PUBLIC_URL=https://property.example.com",
    "bun run backup",
    "Self-hosted Docker Compose",
    "openssl rand -hex 32",
    "--env-file .env.production",
    "remove `NIVASA_INSTALL_TOKEN`",
    "PHP-only shared hosting",
    "Unsupported deployment patterns"
  ]) if (!deploymentDocs.includes(needle)) failures.push(`docs/DEPLOYMENT.md: missing ${needle}`);

  for (const needle of ["bun run restore", "off-host", "encrypted", "restore"]) {
    if (!backupDocs.includes(needle)) failures.push(`docs/BACKUPS.md: missing ${needle}`);
  }
  for (const needle of ["openssl rand -hex 32", "NIVASA_DOMAIN", "NIVASA_PUBLIC_URL", "NIVASA_INSTALL_TOKEN"]) {
    if (!productionEnv.includes(needle)) failures.push(`.env.production.example: missing ${needle}`);
  }
  for (const needle of ["render.com/deploy?repo=", "docs/DEPLOYMENT.md", "paid persistent disk", "PHP-only shared hosting"]) {
    if (!readme.includes(needle)) failures.push(`README.md: missing ${needle}`);
  }
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Render Blueprint, persistent storage, managed Server Action origins, runtime URL/path normalization, startup migration, one-instance safety, self-hosting, update, backup, and restore deployment contracts are verified.");
