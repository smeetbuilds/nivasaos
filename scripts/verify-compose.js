import fs from "node:fs";
import path from "node:path";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const progressPages = [
  "app/(workspace)/dashboard/page.js",
  "app/(workspace)/invoices/page.js",
  "app/(workspace)/properties/page.js",
  "app/(workspace)/reports/workspace.js"
];
function sourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(child);
    return entry.isFile() && /\.(js|jsx)$/.test(entry.name) ? [child] : [];
  });
}
for (const file of ["Dockerfile", ".dockerignore", "compose.yml", "compose.production.yml", "render.yaml", "Caddyfile", "next.config.mjs", "proxy.js", "app/layout.js", "app/globals.css", "app/styles/progress.css", "app/styles/readability.css", "lib/runtime-config.js", ...progressPages, "scripts/start-container.js", "scripts/container-gate.js", ".circleci/config.yml", "README.md", "DEPLOYMENT.md", "docs/DEPLOYMENT.md", "docs/RENDER.md", "docs/SELF_HOSTING.md", "docs/PRODUCTION_RELEASE.md", "docs/BACKUPS.md"]) {
  if (!fs.existsSync(file)) failures.push(`${file}: missing`);
}
if (fs.existsSync("docker-compose.yml")) failures.push("docker-compose.yml: obsolete duplicate must be removed");

if (!failures.length) {
  const dockerfile = read("Dockerfile");
  const local = read("compose.yml");
  const production = read("compose.production.yml");
  const render = read("render.yaml");
  const caddy = read("Caddyfile");
  const nextConfig = read("next.config.mjs");
  const runtimeConfig = read("lib/runtime-config.js");
  const startContainer = read("scripts/start-container.js");
  const proxy = read("proxy.js");
  const rootLayout = read("app/layout.js");
  const globalStyles = read("app/globals.css");
  const progressStyles = read("app/styles/progress.css");
  const dockerignore = read(".dockerignore");
  const containerGate = read("scripts/container-gate.js");
  const circleci = read(".circleci/config.yml");
  const readme = read("README.md");
  const rootDeployment = read("DEPLOYMENT.md");
  const deploymentDocs = read("docs/DEPLOYMENT.md");
  const renderDocs = read("docs/RENDER.md");
  const selfHostingDocs = read("docs/SELF_HOSTING.md");
  const productionDocs = [readme, deploymentDocs, selfHostingDocs, read("docs/PRODUCTION_RELEASE.md"), read("docs/BACKUPS.md")];

  for (const needle of ["FROM oven/bun:1.3.0", "bun install --frozen-lockfile", "bun run verify", "ARG RENDER_EXTERNAL_HOSTNAME", "ARG NIVASA_PUBLIC_URL", "/app/scripts/start-container.js", "USER bun", 'CMD ["bun", "run", "start"]', "process.env.PORT"]) {
    if (!dockerfile.includes(needle)) failures.push(`Dockerfile: missing ${needle}`);
  }
  for (const needle of [
    "NIVASA_DB_PATH", "NIVASA_UPLOAD_DIR", "NIVASA_BACKUP_DIR", "nivasa_data", "nivasa_uploads", "nivasa_backups",
    "healthcheck", '"127.0.0.1:${NIVASA_PORT:-3000}:3000"', "local-compose-install-token-32-characters"
  ]) if (!local.includes(needle)) failures.push(`compose.yml: missing ${needle}`);
  if (local.includes('      - "${NIVASA_PORT:-3000}:3000"')) failures.push("compose.yml: local application port must bind only to loopback");
  for (const needle of ["env_file", ".env.production", "expose:", "caddy:2.11.4-alpine", "condition: service_healthy", '"80:80"', '"443:443"', 'NIVASA_TRUST_PROXY_HEADERS: "1"']) {
    if (!production.includes(needle)) failures.push(`compose.production.yml: missing ${needle}`);
  }
  if (production.includes("caddy:2-alpine")) failures.push("compose.production.yml: floating Caddy major tag is not allowed");
  const appBlock = production.split("\n  caddy:")[0];
  const caddyBlock = production.split("\n  caddy:")[1] || "";
  if (/\n\s+ports:/.test(appBlock)) failures.push("compose.production.yml: application service must not publish a host port");
  if (/\n\s+env_file:/.test(caddyBlock)) failures.push("compose.production.yml: Caddy must not receive the application environment file");
  if (!caddyBlock.includes("NIVASA_DOMAIN:")) failures.push("compose.production.yml: Caddy must receive only its domain variable");

  for (const needle of [
    "type: web", "runtime: docker", "plan: starter", "numInstances: 1", 'autoDeployTrigger: "off"',
    "healthCheckPath: /api/health", "dockerfilePath: ./Dockerfile", "dockerContext: .",
    "NIVASA_DB_PATH", "/app/storage/nivasaos.sqlite", "NIVASA_UPLOAD_DIR", "/app/storage/uploads",
    "NIVASA_BACKUP_DIR", "/app/storage/backups", "NIVASA_INSTALL_TOKEN", "sync: false",
    "mountPath: /app/storage", "sizeGB: 1"
  ]) if (!render.includes(needle)) failures.push(`render.yaml: missing ${needle}`);
  if (render.includes("NIVASA_TRUST_PROXY_HEADERS")) failures.push("render.yaml: must not trust a client-supplied proxy header");
  if (render.includes("preDeployCommand")) failures.push("render.yaml: disk migrations must not run in a pre-deploy instance without disk access");
  if (!runtimeConfig.includes("RENDER_EXTERNAL_URL")) failures.push("lib/runtime-config.js: Render external URL fallback is missing");
  if (!runtimeConfig.includes("database?.close(false)")) failures.push("lib/runtime-config.js: installation probe must close cached SQLite statements safely");
  if (!nextConfig.includes("RENDER_EXTERNAL_HOSTNAME") || !nextConfig.includes("managedPlatformOrigins")) failures.push("next.config.mjs: managed Server Action origins are missing");
  for (const needle of ["assertRuntimeEnvironment", "normalizedRuntimeEnvironment", 'bun, "run", "scripts/migrate.js"', 'bun, "server.js"']) {
    if (!startContainer.includes(needle)) failures.push(`scripts/start-container.js: missing ${needle}`);
  }

  const exactCaddyHeaders = [
    'Strict-Transport-Security "max-age=31536000; includeSubDomains"',
    'Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"',
    'Cross-Origin-Opener-Policy "same-origin"',
    'X-Frame-Options "DENY"',
    'X-Content-Type-Options "nosniff"',
    'Referrer-Policy "strict-origin-when-cross-origin"'
  ];
  for (const needle of ["{$NIVASA_DOMAIN}", "reverse_proxy nivasaos:3000", "header_up X-Nivasa-Client-IP {remote_host}", ...exactCaddyHeaders]) {
    if (!caddy.includes(needle)) failures.push(`Caddyfile: missing secure contract ${needle}`);
  }
  if (caddy.includes("Content-Security-Policy")) failures.push("Caddyfile: proxy must not overwrite the per-request application CSP");

  const exactNextHeaders = [
    '{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" }',
    '{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }',
    '{ key: "X-Frame-Options", value: "DENY" }',
    '{ key: "X-Content-Type-Options", value: "nosniff" }',
    '{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }'
  ];
  for (const needle of exactNextHeaders) if (!nextConfig.includes(needle)) failures.push(`next.config.mjs: missing secure contract ${needle}`);
  if (nextConfig.includes("Content-Security-Policy")) failures.push("next.config.mjs: static headers must not override the nonce CSP");

  for (const needle of ["randomUUID", "requestHeaders.set(\"x-nonce\", nonce)", "'nonce-${nonce}'", "'strict-dynamic'", "default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "upgrade-insecure-requests"]) {
    if (!proxy.includes(needle)) failures.push(`proxy.js: missing nonce CSP contract ${needle}`);
  }
  if (proxy.includes("style-src-attr 'unsafe-inline'")) failures.push("proxy.js: production CSP must not permit arbitrary inline style attributes");
  if (proxy.includes("default-src *") || proxy.includes("script-src *") || proxy.includes("style-src *")) failures.push("proxy.js: wildcard executable/content sources are not allowed");
  if (!rootLayout.includes("await headers()")) failures.push("app/layout.js: nonce-based CSP requires dynamic rendering");

  if (!globalStyles.includes('@import "./styles/progress.css";')) failures.push("app/globals.css: CSP-safe progress styles are not imported");
  if (!globalStyles.includes('@import "./styles/readability.css";')) failures.push("app/globals.css: readability styles are not imported");
  for (const needle of ["progress.native-progress", "::-webkit-progress-bar", "::-webkit-progress-value", "::-moz-progress-bar", "appearance: none", "background: var(--accent)"]) {
    if (!progressStyles.includes(needle)) failures.push(`app/styles/progress.css: missing ${needle}`);
  }
  for (const file of progressPages) {
    const source = read(file);
    if (!source.includes('<progress className="progress native-progress')) failures.push(`${file}: dynamic progress must use the native CSP-safe control`);
    if (!source.includes('max="100"') || !source.includes("value={")) failures.push(`${file}: native progress is missing its bounded dynamic value`);
    if (source.includes("style={{ width:")) failures.push(`${file}: inline progress width remains incompatible with the strict CSP`);
  }
  for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
    const source = read(file);
    if (source.includes("style={{ width:")) failures.push(`${file}: inline dynamic width is incompatible with the strict production CSP`);
    if (source.includes("<style jsx global>")) failures.push(`${file}: runtime global styles must live in the static stylesheet cascade`);
  }

  for (const source of productionDocs) {
    if (!source.includes("docker compose --env-file .env.production -f compose.production.yml") && !source.includes("--env-file .env.production")) {
      failures.push("Production documentation must load .env.production for Compose interpolation");
    }
  }
  for (const needle of ["Deploy to Render", "persistent disk", "NIVASA_INSTALL_TOKEN", "RENDER_EXTERNAL_URL", "Do not scale", "off-platform backup"]) {
    if (!deploymentDocs.includes(needle)) failures.push(`docs/DEPLOYMENT.md: missing ${needle}`);
  }
  for (const needle of ["Deploy to Render", "docs/RENDER.md", "docs/SELF_HOSTING.md", "Render Free without persistent storage"]) if (!rootDeployment.includes(needle)) failures.push(`DEPLOYMENT.md: missing ${needle}`);
  for (const needle of ["paid Render web-service instance", "exactly one service instance", "RENDER_EXTERNAL_URL", "pre-deploy migration command", "off-platform backups"]) if (!renderDocs.includes(needle)) failures.push(`docs/RENDER.md: missing ${needle}`);
  for (const needle of ["compose.production.yml", "Caddy", "openssl rand -hex 32", "--env-file .env.production", "Stop the application before restoring", "Store encrypted backups off-host"]) if (!selfHostingDocs.includes(needle)) failures.push(`docs/SELF_HOSTING.md: missing ${needle}`);
  if (!readme.includes("render.com/deploy?repo=") || (!readme.includes("docs/DEPLOYMENT.md") && !readme.includes("DEPLOYMENT.md"))) failures.push("README.md: Render deployment button or deployment guide link is missing");

  for (const needle of [".env", ".env.*", "!.env.example", "!.env.production.example"]) {
    if (!dockerignore.includes(needle)) failures.push(`.dockerignore: missing ${needle}`);
  }
  for (const needle of [
    "NIVASA_PORT", "NIVASA_INSTALL_TOKEN", "container_gate_marker", "container-gate-proof.txt",
    'compose(["restart", "nivasaos"])', "Application container must not run as root",
    "SQLite named volume did not persist across restart", "Upload named volume did not persist across restart",
    'compose(["down", "-v", "--remove-orphans"]'
  ]) if (!containerGate.includes(needle)) failures.push(`scripts/container-gate.js: missing ${needle}`);
  for (const needle of [
    "container-gate:", "machine:", "ubuntu-2404:2026.05.1", "resource_class: medium",
    "bun-v1.3.0", "docker compose version", "bun run audit:dependencies", "bun run gate:container", "requires:", "release-gate", "only:", "- main"
  ]) if (!circleci.includes(needle)) failures.push(`.circleci/config.yml: missing ${needle}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Canonical self-hosted Compose and Render Blueprint topology, validated startup migration, persistent single-instance storage, managed build/runtime origin handling, exact security headers, nonce-restricted scripts and styles, CSP-safe dynamic widths, env interpolation, pinned runtimes, non-root certification, and deployment documentation are verified.");
