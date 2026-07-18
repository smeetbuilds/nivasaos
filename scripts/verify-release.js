import fs from "node:fs";

const requiredFiles = [
  ".env.production.example",
  ".circleci/config.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  "Caddyfile",
  "compose.yml",
  "compose.production.yml",
  "docs/BACKUPS.md",
  "docs/KNOWN_LIMITATIONS.md",
  "docs/PRODUCTION_RELEASE.md",
  "lib/runtime-config.js",
  "lib/schema/security-migrations.js",
  "scripts/create-install-token.js",
  "scripts/start.js",
  "scripts/verify-secrets.js",
  "scripts/verify-auth-hardening.js",
  "scripts/verify-authorization.js",
  "scripts/verify-compose.js",
  "scripts/verify-integration.js",
  "scripts/container-gate.js",
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

if (packageJson.version !== "1.1.0") failures.push("package.json: expected version 1.1.0");
for (const script of ["setup:token", "verify:secrets", "verify:auth", "verify:authorization", "verify:compose", "verify:integration", "verify:verticals", "verify:release", "gate", "gate:container"]) {
  if (!packageJson.scripts?.[script]) failures.push(`package.json: missing ${script}`);
}
if (!packageJson.scripts.verify.startsWith("bun run verify:secrets")) failures.push("package.json: secret verification must run before the remaining release checks");
if (packageJson.scripts.start !== "bun run scripts/start.js") failures.push("package.json: production start must validate runtime configuration");

const dockerfile = read("Dockerfile");
for (const needle of ["COPY package.json bun.lock ./", "bun install --frozen-lockfile", 'CMD ["bun", "run", "start"]']) if (!dockerfile.includes(needle)) failures.push(`Dockerfile: missing ${needle}`);
const dockerignore = read(".dockerignore");
for (const needle of [".env", ".env.*", "!.env.example", "!.env.production.example"]) if (!dockerignore.includes(needle)) failures.push(`.dockerignore: missing ${needle}`);

const contracts = {
  "app/globals.css": ["part-12.css"],
  "app/(workspace)/layout.js": ["portfolioPermissionsForUser"],
  "app/actions.js": ["propertyRelease.updatePropertyReleaseAction", "authorizeEntityAction"],
  "app/(workspace)/tenant-portal/page.js": ["renderPermissionScopedPage", "portal.manage", "payments.manage", "deposits.manage"],
  "app/(workspace)/tenant-portal/workspace.js": ["configuredPublicUrl", "portal/activate"],
  "app/install/page.js": ["installationProtection", "InstallWizard installationProtection"],
  "components/InstallWizard.js": ["Installation token", "detectedTimezone", "Default country", "Select currency"],
  "lib/actions/auth.js": ["assertInstallationToken", "installation_state", "failed_attempts", "locked_until", "default_country"],
  "lib/actions/property-module-update.js": ["assertGlobalPermission", "before.country", "operatingDefaultsReset"],
  "lib/db.js": ["applySecurityMigrations(database)", "applyReleaseMigrations(database)"],
  "lib/runtime-config.js": ["NIVASA_PUBLIC_URL", "NIVASA_INSTALL_TOKEN", "installationExists", "timingSafeEqual"],
  "lib/schema/release-migrations.js": ["is_customized", "trg_properties_module_reset_defaults", "trg_hostel_reservation_overlap_insert", "trg_space_allocation_reservation_insert", "idx_permission_grants_global_unique", "schema_release"],
  "lib/actions/verticals.js": ["reservationOverlap", "bulkServiceBillingAction", "idempotencyKey"],
  "scripts/local-gate.js": ["runtimeValidationErrors", "gate_restore_marker", "release-backup.tar.gz", "independently of hosted CI"],
  "scripts/verify-integration.js": ["payment_submissions", "deposit_transactions", "service_billing_runs", "hostel_reservations", "PRAGMA integrity_check"],
  "scripts/verify-compose.js": ["private application networking", "compose.production.yml"],
  "scripts/verify-secrets.js": ["fallbackFiles", "git", "ls-files", "PRIVATE KEY", "tracked environment file is not allowed"],
  ".circleci/config.yml": ["oven/bun:1.3.0", "bun install --frozen-lockfile", "bun run gate"],
  ".env.production.example": ["NIVASA_DOMAIN", "NIVASA_PUBLIC_URL", "NIVASA_INSTALL_TOKEN"],
  "compose.production.yml": ["caddy:2-alpine", "condition: service_healthy", "nivasa_backups"],
  "README.md": ["NivasaOS 1.1", "manual-first", "gate:container", "CircleCI", "KNOWN_LIMITATIONS.md"],
  "CONTRIBUTING.md": ["permission boundary", "gate:container", "issue template"],
  "SECURITY.md": ["first-run installer token", "verify:secrets"],
  "CHANGELOG.md": ["## 1.1.0 - 2026-07-18"],
  "docs/BACKUPS.md": ["Scheduled backups", "systemd", "cron"],
  "docs/KNOWN_LIMITATIONS.md": ["manual-first", "Single application instance"],
  "docs/PRODUCTION_RELEASE.md": ["NivasaOS 1.1", "backup and restore recovery", "CircleCI"]
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
  for (const workflow of workflowFiles) {
    if (!read(`.github/workflows/${workflow}`).includes("bun run gate")) failures.push(`.github/workflows/${workflow}: hosted CI must invoke the repository gate`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("NivasaOS 1.1 packaging, secret hygiene, authorization, authentication, integration workflow, backup recovery, container contracts, optional CI evidence, and release documentation are intact.");
