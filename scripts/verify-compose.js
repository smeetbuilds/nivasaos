import fs from "node:fs";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
for (const file of ["Dockerfile", ".dockerignore", "compose.yml", "compose.production.yml", "Caddyfile", "scripts/container-gate.js", ".circleci/config.yml"]) {
  if (!fs.existsSync(file)) failures.push(`${file}: missing`);
}

if (!failures.length) {
  const dockerfile = read("Dockerfile");
  const local = read("compose.yml");
  const production = read("compose.production.yml");
  const caddy = read("Caddyfile");
  const dockerignore = read(".dockerignore");
  const containerGate = read("scripts/container-gate.js");
  const circleci = read(".circleci/config.yml");

  for (const needle of ["FROM oven/bun:1.3.0", "bun install --frozen-lockfile", "bun run verify", "USER bun", 'CMD ["bun", "run", "start"]']) {
    if (!dockerfile.includes(needle)) failures.push(`Dockerfile: missing ${needle}`);
  }
  for (const needle of [
    "NIVASA_DB_PATH", "NIVASA_UPLOAD_DIR", "NIVASA_BACKUP_DIR", "nivasa_data", "nivasa_uploads", "nivasa_backups",
    "healthcheck", "${NIVASA_PORT:-3000}:3000", "local-compose-install-token-32-characters"
  ]) if (!local.includes(needle)) failures.push(`compose.yml: missing ${needle}`);
  for (const needle of ["env_file", ".env.production", "expose:", "caddy:2-alpine", "condition: service_healthy", '"80:80"', '"443:443"']) {
    if (!production.includes(needle)) failures.push(`compose.production.yml: missing ${needle}`);
  }
  const appBlock = production.split("caddy:")[0];
  if (/\n\s+ports:/.test(appBlock)) failures.push("compose.production.yml: application service must not publish a host port");
  for (const needle of ["{$NIVASA_DOMAIN}", "reverse_proxy nivasaos:3000", "Strict-Transport-Security", "X-Content-Type-Options"]) {
    if (!caddy.includes(needle)) failures.push(`Caddyfile: missing ${needle}`);
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
    "bun-v1.3.0", "docker compose version", "bun run gate:container", "requires:", "release-gate", "only:", "- main"
  ]) if (!circleci.includes(needle)) failures.push(`.circleci/config.yml: missing ${needle}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Local and production container topology, pinned runtime, persistent volumes, non-root restart certification, private application networking, and Caddy TLS contracts are verified.");
