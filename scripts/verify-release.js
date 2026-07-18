import fs from "node:fs";

const requiredFiles = [
  ".env.production.example",
  "Caddyfile",
  "compose.production.yml",
  "docs/BACKUPS.md",
  "docs/PRODUCTION_RELEASE.md",
  "lib/runtime-config.js",
  "scripts/create-install-token.js",
  "scripts/start.js",
  "scripts/verify-secrets.js",
  "app/(workspace)/operations/page.js",
  "app/(workspace)/reservations/page.js",
  "app/(workspace)/housekeeping/page.js",
  "app/portal/(account)/requests/page.js",
  "app/styles/part-12.css",
  "lib/actions/verticals.js",
  "lib/actions/property-module-update.js",
  "lib/permissions.js",
  "lib/schema/release-migrations.js",
  "scripts/verify-verticals.js",
  "bun.lock"
];
const failures = [];
for (const filename of requiredFiles) if (!fs.existsSync(filename)) failures.push(`${filename}: missing`);

const read = (filename) => fs.readFileSync(filename, "utf8");
const packageJson = JSON.parse(read("package.json"));
const lockfile = read("bun.lock");
if (!/"lockfileVersion"\s*:\s*1/.test(lockfile) || !/"next"\s*:\s*"16\.2\.10"/.test(lockfile)) failures.push("bun.lock: dependency graph is not pinned");
const privateRegistryMarkers = ["applied-" + "caas", "internal.api." + "openai.org"];
if (privateRegistryMarkers.some((marker) => lockfile.includes(marker))) failures.push("bun.lock: contains environment-specific registry URLs");

if (packageJson.version !== "1.0.0") failures.push("package.json: expected version 1.0.0");
for (const script of ["setup:token", "verify:secrets", "verify:verticals", "verify:release", "gate"]) if (!packageJson.scripts?.[script]) failures.push(`package.json: missing ${script}`);
if (!packageJson.scripts.verify.startsWith("bun run verify:secrets")) failures.push("package.json: secret verification must run before the remaining release checks");
if (packageJson.scripts.start !== "bun run scripts/start.js") failures.push("package.json: production start must validate runtime configuration");

const dockerfile = read("Dockerfile");
for (const needle of ["COPY package.json bun.lock ./", "bun install --frozen-lockfile", 'CMD ["bun", "run", "start"]']) if (!dockerfile.includes(needle)) failures.push(`Dockerfile: missing ${needle}`);
const dockerignore = read(".dockerignore");
for (const needle of [".env", ".env.*", "!.env.example", "!.env.production.example"]) if (!dockerignore.includes(needle)) failures.push(`.dockerignore: missing ${needle}`);

const contracts = {
  "app/globals.css": ["part-12.css"],
  "app/(workspace)/layout.js": ["portfolioPermissionsForUser"],
  "app/actions.js": ["propertyRelease.updatePropertyReleaseAction"],
  "app/(workspace)/tenant-portal/page.js": ["configuredPublicUrl", "portal/activate"],
  "app/install/page.js": ["installationProtection", "InstallWizard installationProtection"],
  "components/InstallWizard.js": ["Installation token", "detectedTimezone", "Select currency"],
  "lib/actions/auth.js": ["assertInstallationToken", "Select a supported currency"],
  "lib/db.js": ["applyReleaseMigrations(database)"],
  "lib/runtime-config.js": ["NIVASA_PUBLIC_URL", "NIVASA_INSTALL_TOKEN", "installationExists", "timingSafeEqual"],
  "lib/schema/release-migrations.js": ["is_customized", "trg_properties_module_reset_defaults", "trg_hostel_reservation_overlap_insert", "trg_space_allocation_reservation_insert", "idx_permission_grants_global_unique", "schema_release"],
  "lib/actions/property-module-update.js": ["is_customized=1", "operatingDefaultsReset"],
  "lib/actions/verticals.js": ["reservationOverlap", "bulkServiceBillingAction", "idempotencyKey"],
  "scripts/local-gate.js": ["assertRuntimeEnvironment", "/api/health", "/install", "/dashboard", "without GitHub Actions"],
  "scripts/verify-secrets.js": ["git", "ls-files", "PRIVATE KEY", "tracked environment file is not allowed"],
  ".env.production.example": ["NIVASA_DOMAIN", "NIVASA_PUBLIC_URL", "NIVASA_INSTALL_TOKEN"],
  "compose.production.yml": ["caddy:2-alpine", "condition: service_healthy", "nivasa_backups"],
  "README.md": ["No API keys required", "compose.production.yml", "setup:token", "verify:secrets"],
  "SECURITY.md": ["first-run installer token", "verify:secrets"],
  "CHANGELOG.md": ["## 1.0.0 - 2026-07-17"]
};
for (const [filename, needles] of Object.entries(contracts)) {
  const source = read(filename);
  for (const needle of needles) if (!source.includes(needle)) failures.push(`${filename}: missing ${needle}`);
}

const responsive = read("app/styles/part-12.css");
for (const needle of ["@media (max-width: 820px)", "env(safe-area-inset-bottom)", ":focus-visible", "prefers-reduced-motion"]) {
  if (!responsive.includes(needle)) failures.push(`responsive QA contract missing: ${needle}`);
}

if (fs.existsSync(".github/workflows")) {
  const workflowFiles = fs.readdirSync(".github/workflows").filter((name) => /\.ya?ml$/i.test(name));
  if (workflowFiles.length) failures.push("Release must not depend on GitHub Actions workflows");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("NivasaOS 1.0 open-source packaging, secret hygiene, protected installation, reproducible containers, release wiring, and self-hosted verification are intact.");
