import fs from "node:fs";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
for (const file of ["Dockerfile", ".dockerignore", "compose.yml", "compose.production.yml", "Caddyfile"]) {
  if (!fs.existsSync(file)) failures.push(`${file}: missing`);
}

if (!failures.length) {
  const dockerfile = read("Dockerfile");
  const local = read("compose.yml");
  const production = read("compose.production.yml");
  const caddy = read("Caddyfile");
  const dockerignore = read(".dockerignore");
  for (const needle of ["bun install --frozen-lockfile", "bun run verify", 'USER bun', 'CMD ["bun", "run", "start"]']) if (!dockerfile.includes(needle)) failures.push(`Dockerfile: missing ${needle}`);
  for (const needle of ["NIVASA_DB_PATH", "NIVASA_UPLOAD_DIR", "NIVASA_BACKUP_DIR", "nivasa_data", "nivasa_uploads", "nivasa_backups", "healthcheck"]) if (!local.includes(needle)) failures.push(`compose.yml: missing ${needle}`);
  for (const needle of ["env_file", ".env.production", "expose:", "caddy:2-alpine", "condition: service_healthy", '"80:80"', '"443:443"']) if (!production.includes(needle)) failures.push(`compose.production.yml: missing ${needle}`);
  const appBlock = production.split("caddy:")[0];
  if (/\n\s+ports:/.test(appBlock)) failures.push("compose.production.yml: application service must not publish a host port");
  for (const needle of ["{$NIVASA_DOMAIN}", "reverse_proxy nivasaos:3000", "Strict-Transport-Security", "X-Content-Type-Options"]) if (!caddy.includes(needle)) failures.push(`Caddyfile: missing ${needle}`);
  for (const needle of [".env", ".env.*", "!.env.example", "!.env.production.example"]) if (!dockerignore.includes(needle)) failures.push(`.dockerignore: missing ${needle}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Local and production container topology, persistent volumes, health checks, private application networking, and Caddy TLS contracts are verified.");
