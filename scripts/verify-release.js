import fs from "node:fs";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const requireFile = (file) => { if (!fs.existsSync(file)) failures.push(`${file}: missing`); };
const requireText = (file, values) => {
  requireFile(file);
  if (!fs.existsSync(file)) return;
  const source = read(file);
  for (const value of values) if (!source.includes(value)) failures.push(`${file}: missing ${value}`);
};

for (const file of [
  ".editorconfig", ".env.production.example", ".circleci/config.yml", ".github/CODEOWNERS", ".github/dependabot.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/feature_request.yml", ".github/ISSUE_TEMPLATE/config.yml",
  "CODE_OF_CONDUCT.md", "CONTRIBUTING.md", "README.md", "SECURITY.md", "CHANGELOG.md", "LICENSE",
  "Caddyfile", "Dockerfile", ".dockerignore", "compose.yml", "compose.production.yml", "render.yaml", "next.config.mjs", "proxy.js", "app/layout.js", "DEPLOYMENT.md",
  "app/api/reports/export/route.js", "app/styles/forms.css", "app/styles/records.css",
  "docs/ACCESSIBILITY_CERTIFICATION.md", "docs/BACKUPS.md", "docs/BROWSER_TESTING.md", "docs/DEPLOYMENT.md", "docs/RENDER.md", "docs/SELF_HOSTING.md", "docs/KNOWN_LIMITATIONS.md",
  "docs/MIGRATIONS.md", "docs/PRODUCTION_RELEASE.md", "docs/REPORTING_EXPORTS.md", "docs/RUNTIME_IMAGE.md", "docs/WHITE_LABEL.md",
  "lib/action-state.js", "lib/auth-rate-limit.js", "lib/document-authorization.js", "lib/money.js", "lib/portal-handoff.js",
  "lib/workspace-localization.js", "lib/runtime-config.js", "lib/schema/core-schema.js", "lib/schema/migrate.js",
  "lib/schema/security-migrations.js", "lib/schema/release-migrations.js", "lib/schema/localization-migrations.js", "lib/schema/money-migrations.js",
  "scripts/migrate.js", "scripts/verify-secrets.js", "scripts/verify-auth-hardening.js", "scripts/verify-audit-hardening.js",
  "scripts/verify-action-state.js", "scripts/verify-authorization.js", "scripts/verify-browser-gate.js", "scripts/verify-certification-contract.js",
  "scripts/verify-integration.js", "scripts/verify-migrations.js", "scripts/verify-mobile-records.js", "scripts/verify-money-storage.js",
  "scripts/verify-operations.js", "scripts/verify-reporting.js", "scripts/verify-runtime-image.js", "scripts/verify-verticals.js",
  "scripts/verify-compose.js", "scripts/cross-browser-gate.js", "scripts/start-container.js", "scripts/verify-certification-evidence.js",
  "scripts/lib/tar-archive.js", "scripts/lib/operations.js", "scripts/container-gate.js", "scripts/local-gate.js", "bun.lock"
]) requireFile(file);

if (fs.existsSync("docker-compose.yml")) failures.push("docker-compose.yml: obsolete duplicate remains");
if (fs.existsSync("brand-assets/NivasaOS_Brand_Assets.zip")) failures.push("brand-assets: duplicated binary archive remains");

const packageJson = JSON.parse(read("package.json"));
const lockfile = read("bun.lock");
if (packageJson.version !== "1.1.0") failures.push("package.json: expected version 1.1.0");
if (!/"lockfileVersion"\s*:\s*1/.test(lockfile) || !/"next"\s*:\s*"16\.2\.10"/.test(lockfile)) failures.push("bun.lock: dependency graph is not pinned");
const privateRegistryMarkers = ["applied-" + "caas", "internal.api." + "openai.org"];
if (privateRegistryMarkers.some((marker) => lockfile.includes(marker))) failures.push("bun.lock: contains environment-specific registry URLs");

const expectedVerifyScripts = [
  "verify:secrets", "verify:source", "verify:schema", "verify:migrations", "verify:auth", "verify:operations", "verify:money",
  "verify:reporting", "verify:ui", "verify:mobile-records", "verify:action-state", "verify:browser-contract", "verify:certification",
  "verify:authorization", "verify:portal", "verify:handover", "verify:modules", "verify:verticals", "verify:integration",
  "verify:compose", "verify:runtime-image", "verify:hardening", "verify:remediation", "verify:release"
];
const requiredScripts = ["setup:token", "migrate", "audit:dependencies", ...expectedVerifyScripts, "gate", "gate:browser", "gate:cross-browser", "certify:device", "gate:container"];
for (const script of requiredScripts) if (!packageJson.scripts?.[script]) failures.push(`package.json: missing ${script}`);
const expectedVerifyChain = expectedVerifyScripts.map((script) => `bun run ${script}`);
const actualVerifySource = String(packageJson.scripts.verify || "").trim();
const actualVerifyChain = actualVerifySource ? actualVerifySource.split(/\s*&&\s*/).map((step) => step.trim()) : [];
if (JSON.stringify(actualVerifyChain) !== JSON.stringify(expectedVerifyChain)) failures.push(`package.json: verify chain must exactly equal ${expectedVerifyChain.join(" && ")}`);
if (/[|;]|\btrue\b|\bexit\s+0\b/.test(actualVerifySource)) failures.push("package.json: verify chain contains an unsafe shell bypass or extra operator");
if (packageJson.scripts["audit:dependencies"] !== "bun audit --prod --audit-level=high") failures.push("package.json: dependency audit contract changed");
if (packageJson.scripts.build !== "bun --bun next build --webpack") failures.push("package.json: production build contract changed");
if (packageJson.scripts.migrate !== "bun run scripts/migrate.js") failures.push("package.json: migration command changed");

const contracts = {
  "app/api/lease-documents/[id]/route.js": ["canDeliverLeaseDocument", "hasPermission", "archived_at IS NULL"],
  "app/api/reports/export/route.js": ["hasPortfolioPermission", "hasPermission", "reportData", "minorDecimal", "amount_minor", "private, no-store"],
  "lib/document-authorization.js": ["handover.manage", "authorize(permission", "propertyId"],
  "app/(workspace)/tenant-portal/workspace.js": ["PORTAL_HANDOFF_COOKIE", "hashPortalToken(parsedHandoff.token)", "ti.consumed_at IS NULL", "ti.expires_at>$now", "portal/activate"],
  "lib/portal-handoff.js": ["createHmac", "timingSafeEqual", "portal_handoff_secret", "httpOnly: true", "sameSite: \"strict\""],
  "lib/actions/auth.js": ["loginThrottleContext", "verifyPasswordOrDummy", "retryAfter === 0 && !legacyLocked ?", "passwordInput", "legacyLocked", "assertTimeZone", "installation_state"],
  "lib/actions/portal-accounts.js": ["PORTAL_HANDOFF_COOKIE", "encodePortalInviteHandoff", "retryAfter === 0 && !legacyLocked ?", "passwordInput", "legacyLocked"],
  "lib/actions/finance-payments.js": ["moneyInput", "toMinorUnits", "currentPaid"],
  "lib/actions/portal-payments.js": ["SUM(CAST(ROUND(amount * 100) AS INTEGER))", "MAX_MONEY_MINOR", "status='pending'"],
  "lib/actions/portal-deposits.js": ["MAX_MONEY_MINOR", "heldMinor < 0", "CAST(ROUND(amount*100) AS INTEGER)"],
  "lib/actions/verticals.js": ["validDate(zoned[1]", "sameStatus", "currentStatus", "created.length", "(0[1-9]|1[0-2])"],
  "lib/actions/settings.js": ["invalidateWorkspaceLocalizationCache"],
  "lib/action-state.js": ["runStructuredAction", "SENSITIVE_FIELD", "NEXT_REDIRECT", "serializedValues"],
  "lib/db.js": ["migrateDatabase(database)", "database.close(false)"],
  "lib/runtime-config.js": ["RENDER_EXTERNAL_URL", "database?.close(false)", "normalized.NIVASA_PUBLIC_URL"],
  "lib/schema/migrate.js": ["MIGRATION_PLAN", "schema_migrations", "migrationStatus", "migrateDatabase", "050-money-contract-v4"],
  "lib/schema/core-schema.js": ["CREATE TABLE IF NOT EXISTS auth_rate_limits"],
  "lib/schema/localization-migrations.js": ["SELECT 'timezone','UTC'"],
  "lib/schema/money-migrations.js": ["MONEY_SCALE_CONTRACT_VERSION", "MONEY_MINOR_MIRROR_VERSION", "MONEY_MAX_MINOR", "ensureMinorMirror", "money_minor_mirror_contract"],
  "lib/auth-rate-limit.js": ["auth_rate_limits", "dimension: \"account\"", "dimension: \"network\"", "windowStarted <= nowMs - item.windowMs"],
  "lib/money.js": ["MAX_MONEY_MINOR", "NUMERIC_NOISE_TOLERANCE", "BigInt", "minorDecimal", "supported monetary range"],
  "lib/workspace-localization.js": ["zonedDateTimeToIso", "setUTCFullYear", "invalidateWorkspaceLocalizationCache"],
  "lib/format.js": ["normalizedTimestamp", "moneyMinor", "fromMinorUnits", "workspaceTimeZone"],
  "lib/data.js": ["monthly_rate_minor", "amount_minor", "amount_paid_minor", "pay.amount_minor", "balance_minor", "total_minor"],
  "scripts/migrate.js": ["migrateDatabase(database)", "database.close(false)"],
  "scripts/verify-integration.js": ["applyLocalizationMigrations", "applyMoneyMigrations", "historical sub-cent values", "PRAGMA integrity_check"],
  "scripts/verify-migrations.js": ["MIGRATION_PLAN", "Second migration run was not idempotent", "Failed migration was incorrectly recorded", "PRAGMA quick_check"],
  "scripts/verify-money-storage.js": ["money_minor_mirror_contract", "monthly_rate_minor", "Direct minor-unit mismatch", "Out-of-range money value"],
  "scripts/verify-reporting.js": ["u.monthly_rate_minor", "i.amount_minor", "pay.amount_minor", "minorDecimal"],
  "scripts/verify-mobile-records.js": ["data-mobile-cards", "data-label", "visitors", "arrears"],
  "scripts/verify-action-state.js": ["Structured server-action errors", "sensitive values leaked", "legacy direct forms"],
  "scripts/cross-browser-gate.js": ["playwright.firefox", "playwright.webkit", "delegatedStaff", "tenantWorkflow", "Tab focus escaped the modal dialog"],
  "scripts/verify-certification-evidence.js": ["Windows Firefox with NVDA or JAWS", "physical Android Chrome", "physical iOS Safari"],
  "scripts/verify-operations.js": ["formatVersion === 2", "maxEntryBytes: 1", "pre-activation restore failure", "Archive writer accepted a traversal path"],
  "scripts/lib/tar-archive.js": ["createGzip", "createGunzip", "maxExpandedBytes", "maxEntryBytes", "maxEntries", "safeDestination"],
  "scripts/lib/operations.js": ["VACUUM INTO", "formatVersion: FORMAT_VERSION", "upload checksum", "databaseInstalled", "uploadsInstalled"],
  "scripts/verify-audit-hardening.js": ["canDeliverLeaseDocument", "Large adjacent cent values", "Money helper rejected ordinary SQLite REAL aggregate noise", "'nonce-${nonce}'"],
  "scripts/start-container.js": ["assertRuntimeEnvironment", "normalizedRuntimeEnvironment", "scripts/migrate.js", "server.js"],
  "scripts/verify-compose.js": ["render.yaml", "RENDER_EXTERNAL_URL", "persistent single-instance storage", "exact security headers"],
  "scripts/verify-runtime-image.js": ["standalone", "1.3.0-alpine", "NIVASA_MAX_IMAGE_BYTES", "schema_migrations"],
  "scripts/container-gate.js": ["NIVASA_MAX_IMAGE_BYTES", "image", "inspect", "schema_migrations", "bun\", \"run\", \"migrate", "Runtime image is"],
  ".circleci/config.yml": ["oven/bun:1.3.0", "playwright:v1.61.1-noble", "bun run audit:dependencies", "bun run gate", "bun run gate:cross-browser", "bun run gate:container"],
  "Dockerfile": ["oven/bun:1.3.0-alpine", ".next/standalone", "ARG RENDER_EXTERNAL_HOSTNAME", "ARG NIVASA_PUBLIC_URL", "process.env.PORT", "scripts/start-container.js", "scripts/migrate.js", "USER bun"],
  "render.yaml": ["runtime: docker", "plan: starter", "numInstances: 1", "autoDeployTrigger: \"off\"", "healthCheckPath: /api/health", "mountPath: /app/storage", "sync: false"],
  "compose.production.yml": ["caddy:2.11.4-alpine", "NIVASA_DOMAIN:", "condition: service_healthy"],
  "Caddyfile": ["header_up X-Nivasa-Client-IP {remote_host}", "X-Frame-Options \"DENY\""],
  "next.config.mjs": ["output: \"standalone\"", "RENDER_EXTERNAL_HOSTNAME", "managedPlatformOrigins", "X-Frame-Options", "DENY", "Permissions-Policy"],
  "proxy.js": ["randomUUID", "x-nonce", "'nonce-${nonce}'", "'strict-dynamic'", "default-src 'self'", "frame-ancestors 'none'"],
  "app/layout.js": ["await headers()"],
  "README.md": ["NivasaOS 1.1", "technical preview", "application append-only", "Deploy to Render", "docs/DEPLOYMENT.md", "gate:container"],
  "DEPLOYMENT.md": ["Deploy to Render", "docs/RENDER.md", "docs/SELF_HOSTING.md", "Render Free without persistent storage"],
  "SECURITY.md": ["network throttling", "minor-unit", "file-delivery"],
  "CHANGELOG.md": ["## Unreleased", "streamed", "minor-unit mirror", "## 1.1.0 - 2026-07-18", "## 0.1.0 - 2026-07-16"],
  "docs/DEPLOYMENT.md": ["Render Blueprint deployment", "Self-hosted Docker Compose", "RENDER_EXTERNAL_URL", "off-platform backup", "Unsupported deployment patterns"],
  "docs/RENDER.md": ["paid Render web-service instance", "exactly one service instance", "RENDER_EXTERNAL_URL", "pre-deploy migration command", "off-platform backups"],
  "docs/SELF_HOSTING.md": ["compose.production.yml", "openssl rand -hex 32", "Stop the application before restoring", "Store encrypted backups off-host"],
  "docs/KNOWN_LIMITATIONS.md": ["minor-unit mirror", "Migration ownership and rollback", "Runtime-image boundary", "Verification boundary"],
  "docs/MIGRATIONS.md": ["schema_migrations", "single-instance", "bun run migrate", "idempotent"],
  "docs/RUNTIME_IMAGE.md": ["standalone", "oven/bun:1.3.0-alpine", "NIVASA_MAX_IMAGE_BYTES", "operator commands"],
  "docs/PRODUCTION_RELEASE.md": ["backup and restore recovery", "bounded streaming", "CircleCI evidence", "audit:dependencies"],
  "docs/WHITE_LABEL.md": ["brand-assets/", "does not include a duplicated ZIP bundle"]
};
for (const [file, values] of Object.entries(contracts)) requireText(file, values);

for (const file of [
  "lib/db.js", "lib/runtime-config.js", "scripts/migrate.js", "scripts/verify-auth-hardening.js", "scripts/verify-migrations.js",
  "scripts/verify-money-storage.js", "scripts/verify-operations.js", "scripts/verify-integration.js",
  "scripts/browser-gate.js", "scripts/cross-browser-gate.js", "scripts/local-gate.js", "scripts/lib/operations.js"
]) {
  if (read(file).includes(".close(true)")) failures.push(`${file}: strict Bun SQLite close can mask completed assertions or the original runtime error`);
}

if (read("Caddyfile").includes("Content-Security-Policy")) failures.push("Caddyfile: must not override the per-request nonce CSP");
if (read("next.config.mjs").includes("Content-Security-Policy")) failures.push("next.config.mjs: static headers must not override the per-request nonce CSP");
if (read("render.yaml").includes("NIVASA_TRUST_PROXY_HEADERS")) failures.push("render.yaml: must not trust public proxy metadata without an operator-controlled header rewrite");
const responsive = read("app/styles/part-12.css");
for (const value of ["@media (max-width: 820px)", "env(safe-area-inset-bottom)", ":focus-visible", "prefers-reduced-motion"]) {
  if (!responsive.includes(value)) failures.push(`responsive QA contract missing: ${value}`);
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("NivasaOS packaging, exact repository gate, self-hosted and Render deployment contracts, validated startup migration, centralized migration ownership, safe Bun SQLite cleanup, slim standalone runtime, authenticated browser matrix, evidence-backed accessibility, structured validation, exact reporting, mobile records, bounded recovery, security, governance, and release contracts are intact.");
