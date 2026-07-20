import fs from "node:fs";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
for (const file of ["Dockerfile", ".dockerignore", "compose.yml", "compose.production.yml", "Caddyfile", "next.config.mjs", "proxy.js", "app/layout.js", "scripts/container-gate.js", ".circleci/config.yml", "README.md", "docs/PRODUCTION_RELEASE.md", "docs/BACKUPS.md"]) {
  if (!fs.existsSync(file)) failures.push(`${file}: missing`);
}
if (fs.existsSync("docker-compose.yml")) failures.push("docker-compose.yml: obsolete duplicate must be removed");

if (!failures.length) {
  const dockerfile = read("Dockerfile");
  const local = read("compose.yml");
  const production = read("compose.production.yml");
  const caddy = read("Caddyfile");
  const nextConfig = read("next.config.mjs");
  const proxy = read("proxy.js");
  const rootLayout = read("app/layout.js");
  const dockerignore = read(".dockerignore");
  const containerGate = read("scripts/container-gate.js");
  const circleci = read(".circleci/config.yml");
  const productionDocs = [read("README.md"), read("docs/PRODUCTION_RELEASE.md"), read("docs/BACKUPS.md")];

  for (const needle of ["FROM oven/bun:1.3.0", "bun install --frozen-lockfile", "bun run verify", "USER bun", 'CMD ["bun", "run", "start"]']) {
    if (!dockerfile.includes(needle)) failures.push(`Dockerfile: missing ${needle}`);
  }
  for (const needle of [
    "NIVASA_DB_PATH", "NIVASA_UPLOAD_DIR", "NIVASA_BACKUP_DIR", "nivasa_data", "nivasa_uploads", "nivasa_backups",
    "healthcheck", "${NIVASA_PORT:-3000}:3000", "local-compose-install-token-32-characters"
  ]) if (!local.includes(needle)) failures.push(`compose.yml: missing ${needle}`);
  for (const needle of ["env_file", ".env.production", "expose:", "caddy:2.11.4-alpine", "condition: service_healthy", '"80:80"', '"443:443"', 'NIVASA_TRUST_PROXY_HEADERS: "1"']) {
    if (!production.includes(needle)) failures.push(`compose.production.yml: missing ${needle}`);
  }
  if (production.includes("caddy:2-alpine")) failures.push("compose.production.yml: floating Caddy major tag is not allowed");
  const appBlock = production.split("\n  caddy:")[0];
  const caddyBlock = production.split("\n  caddy:")[1] || "";
  if (/\n\s+ports:/.test(appBlock)) failures.push("compose.production.yml: application service must not publish a host port");
  if (/\n\s+env_file:/.test(caddyBlock)) failures.push("compose.production.yml: Caddy must not receive the application environment file");
  if (!caddyBlock.includes("NIVASA_DOMAIN:")) failures.push("compose.production.yml: Caddy must receive only its domain variable");

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

  for (const needle of ["randomUUID", "requestHeaders.set(\"x-nonce\", nonce)", "'nonce-${nonce}'", "'strict-dynamic'", "default-src 'self'", "style-src-attr 'unsafe-inline'", "frame-ancestors 'none'", "object-src 'none'", "upgrade-insecure-requests"]) {
    if (!proxy.includes(needle)) failures.push(`proxy.js: missing nonce CSP contract ${needle}`);
  }
  if (proxy.includes("default-src *") || proxy.includes("script-src *") || proxy.includes("style-src *")) failures.push("proxy.js: wildcard executable/content sources are not allowed");
  if (!rootLayout.includes("await headers()")) failures.push("app/layout.js: nonce-based CSP requires dynamic rendering");

  for (const source of productionDocs) {
    if (!source.includes("docker compose --env-file .env.production -f compose.production.yml")) failures.push("Production documentation must load .env.production for Compose interpolation");
  }
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
console.log("Canonical Compose topology, exact security-header values, nonce-restricted scripts and style elements, scoped dynamic style attributes, env-file interpolation, pinned runtimes, trusted proxy metadata, persistent volumes, non-root certification, and private application networking are verified.");
