import fs from "node:fs";

const failures = [];
const read = (filename) => fs.readFileSync(filename, "utf8");
const requireContains = (filename, needles) => {
  if (!fs.existsSync(filename)) {
    failures.push(`${filename}: missing`);
    return;
  }
  const source = read(filename);
  for (const needle of needles) if (!source.includes(needle)) failures.push(`${filename}: missing ${needle}`);
};

const requiredFiles = [
  ".editorconfig", ".env.production.example", ".circleci/config.yml", ".github/CODEOWNERS", ".github/dependabot.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/feature_request.yml", ".github/ISSUE_TEMPLATE/config.yml",
  "CODE_OF_CONDUCT.md", "Caddyfile", "compose.yml", "compose.production.yml", "docs/BACKUPS.md", "docs/KNOWN_LIMITATIONS.md",
  "docs/PRODUCTION_RELEASE.md", "lib/runtime-config.js", "lib/auth-rate-limit.js", "lib/money.js", "lib/workspace-localization.js",
  "lib/schema/security-migrations.js", "lib/schema/money-migrations.js", "scripts/create-install-token.js", "scripts/start.js",
  "scripts/backup.js", "scripts/restore.js", "scripts/lib/operations.js", "scripts/lib/tar-archive.js", "scripts/verify-secrets.js",
  "scripts/verify-auth-hardening.js", "scripts/verify-audit-hardening.js", "scripts/verify-authorization.js", "scripts/verify-compose.js",
  "scripts/verify-integration.js", "scripts/container-gate.js", "app/(workspace)/operations/page.js",
  "app/(workspace)/reservations/page.js", "app/(workspace)/housekeeping/page.js", "app/portal/(account)/requests/page.js",
  "app/styles/part-12.css", "lib/actions/verticals.js", "lib/actions/property-module-update.js", "lib/permissions.js",
  "lib/schema/release-migrations.js", "scripts/verify-verticals.js", "bun.lock"
];
for (const filename of requiredFiles) if (!fs.existsSync(filename)) failures.push(`${filename}: missing`);
if (fs.existsSync("docker-compose.yml")) failures.push("docker-compose.yml: obsolete duplicate remains");
if (fs.existsSync("brand-assets/NivasaOS_Brand_Assets.zip")) failures.push("brand-assets: duplicated binary archive remains");

const packageJson = JSON.parse(read("package.json"));
const lockfile = read("bun.lock");
if (!/"lockfileVersion"\s*:\s*1/.test(lockfile) || !/"next"\s*:\s*"16\.2\.10"/.test(lockfile)) failures.push("bun.lock: dependency graph is not pinned");
const privateRegistryMarkers = ["applied-" + "caas", "internal.api." + "openai.org"];
if (privateRegistryMarkers.some((marker) => lockfile.includes(marker))) failures.push("bun.lock: contains environment-specific registry URLs");
if (packageJson.version !== "1.1.0") failures.push("package.json: expected version 1.1.0");
for (const script of ["setup:token", "audit:dependencies", "verify:secrets", "verify:auth", "verify:authorization", "verify:compose", "verify:integration", "verify:verticals", "verify:hardening", "verify:release", "gate", "gate:container"]) {
  if (!packageJson.scripts?.[script]) failures.push(`package.json: missing ${script}`);
}
if (!packageJson.scripts.verify.startsWith("bun run verify:secrets")) failures.push("package.json: secret verification must run before the remaining release checks");
if (!packageJson.scripts.verify.includes("bun run verify:hardening")) failures.push("package.json: audit hardening verifier is not part of the repository gate");
if (packageJson.scripts["audit:dependencies"] !== "bun audit --prod --audit-level=high") failures.push("package.json: production dependency audit contract changed");
if (packageJson.scripts.build !== "bun --bun next build --webpack") failures.push("package.json: production build must use the supported Next.js 16 Webpack path");
if (packageJson.scripts.start !== "bun run scripts/start.js") failures.push("package.json: production start must validate runtime configuration");

requireContains("Dockerfile", ["COPY package.json bun.lock ./", "bun install --frozen-lockfile", 'CMD ["bun", "run", "start"]']);
requireContains(".dockerignore", [".env", ".env.*", "!.env.example", "!.env.production.example"]);

const contracts = {
  "app/globals.css": ["part-12.css"],
  "app/(workspace)/layout.js": ["portfolioPermissionsForUser"],
  "app/actions.js": ["propertyRelease.updatePropertyReleaseAction", "authorizeEntityAction"],
  "app/(workspace)/tenant-portal/page.js": ["renderPermissionScopedPage", "portal.manage", "payments.manage", "deposits.manage"],
  "app/(workspace)/tenant-portal/workspace.js": ["configuredPublicUrl", "portal/activate", "nivasa_portal_invite_handoff"],
  "app/api/lease-documents/[id]/route.js": ["handover.manage", "hasPermission", "archived_at IS NULL"],
  "app/install/page.js": ["installationProtection", "InstallWizard installationProtection"],
  "components/InstallWizard.js": ["Installation token", "detectedTimezone", "Default country", "Select currency"],
  "lib/actions/auth.js": ["assertInstallationToken", "installation_state", "loginThrottleContext", "verifyPasswordOrDummy", "assertTimeZone"],
  "lib/actions/portal-accounts.js": ["PORTAL_HANDOFF_COOKIE", "httpOnly: true", "loginThrottleContext", "verifyPasswordOrDummy"],
  "lib/actions/property-module-update.js": ["assertGlobalPermission", "before.country", "operatingDefaultsReset"],
  "lib/db.js": ["applySecurityMigrations(database)", "applyReleaseMigrations(database)", "applyMoneyMigrations(database)"],
  "lib/auth-rate-limit.js": ["auth_rate_limits", "dimension: \"account\"", "dimension: \"network\"", "createHash(\"sha256\")"],
  "lib/money.js": ["toMinorUnits", "moneyInput", "two decimal places"],
  "lib/workspace-localization.js": ["assertTimeZone", "workspaceTimeZone", "businessDate"],
  "lib/runtime-config.js": ["NIVASA_PUBLIC_URL", "NIVASA_INSTALL_TOKEN", "installationExists", "timingSafeEqual"],
  "lib/schema/security-migrations.js": ["auth_rate_limits", "database.transaction"],
  "lib/schema/money-migrations.js": ["MONEY_COLUMNS", "money values must use no more than two decimal places", "money_scale_contract"],
  "lib/schema/release-migrations.js": ["is_customized", "trg_properties_module_reset_defaults", "trg_hostel_reservation_overlap_insert", "trg_space_allocation_reservation_insert", "idx_permission_grants_global_unique", "schema_release"],
  "lib/actions/verticals.js": ["reservationOverlap", "bulkServiceBillingAction", "currentStatus", "created.length", "(0[1-9]|1[0-2])"],
  "scripts/backup.js": ["./lib/operations.js", "createBackup"],
  "scripts/restore.js": ["./lib/operations.js", "inspectBackup", "restoreBackup"],
  "scripts/lib/operations.js": ["createTarGzip", "readTarGzip", "Backup upload manifest does not match archive contents"],
  "scripts/lib/tar-archive.js": ["gzipSync", "gunzipSync", "ustar"],
  "scripts/local-gate.js": ["runtimeValidationErrors", "gate_restore_marker", "release-backup.tar.gz", "NIVASA_GATE_SKIP_VERIFY", "NIVASA_GATE_SKIP_BUILD", "NIVASA_GATE_STOP_AFTER", "independently of hosted CI"],
  "scripts/verify-integration.js": ["applyMoneyMigrations", "more than two decimals", "payment_submissions", "deposit_transactions", "service_billing_runs", "hostel_reservations", "PRAGMA integrity_check"],
  "scripts/verify-compose.js": ["proxy environment isolation", "compose.production.yml"],
  "scripts/verify-audit-hardening.js": ["Document authorization", "exact money reconciliation", "secure login/token handling"],
  "scripts/verify-secrets.js": ["fallbackFiles", "git", "ls-files", "PRIVATE KEY", "tracked environment file is not allowed"],
  ".circleci/config.yml": ["oven/bun:1.3.0", "release-gate", "bun install --frozen-lockfile", "bun run audit:dependencies", "bun run gate"],
  ".env.production.example": ["NIVASA_DOMAIN", "NIVASA_PUBLIC_URL", "NIVASA_INSTALL_TOKEN"],
  "compose.yml": ["NIVASA_DB_PATH", "NIVASA_UPLOAD_DIR", "NIVASA_BACKUP_DIR", "nivasa_data", "nivasa_uploads", "nivasa_backups", "healthcheck"],
  "compose.production.yml": ["caddy:2-alpine", "condition: service_healthy", "nivasa_backups", "NIVASA_DOMAIN:"],
  "README.md": ["NivasaOS 1.1", "manual-first", "gate:container", "CircleCI", "KNOWN_LIMITATIONS.md", "application append-only"],
  "CONTRIBUTING.md": ["permission boundary", "gate:container", "issue template"],
  "SECURITY.md": ["first-run installer token", "verify:secrets", "network throttling"],
  "CHANGELOG.md": ["## Unreleased", "## 1.1.0 - 2026-07-18"],
  "docs/BACKUPS.md": ["Scheduled backups", "systemd", "cron"],
  "docs/KNOWN_LIMITATIONS.md": ["Manual-first", "Single application instance", "minor-unit"],
  "docs/PRODUCTION_RELEASE.md": ["NivasaOS 1.1", "backup and restore recovery", "CircleCI"]
};
for (const [filename, needles] of Object.entries(contracts)) requireContains(filename, needles);
if (read("scripts/lib/operations.js").includes("Bun.Archive")) failures.push("scripts/lib/operations.js: Bun.Archive is not supported by the minimum Bun runtime");

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
console.log("NivasaOS 1.1 packaging, authorization, authentication, money precision, timezone, integration, backup recovery, container contracts, dependency audit, open-source governance, and release documentation are intact.");
