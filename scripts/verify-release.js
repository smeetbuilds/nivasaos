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
  "Caddyfile", "Dockerfile", ".dockerignore", "compose.yml", "compose.production.yml", "next.config.mjs", "proxy.js", "app/layout.js",
  "docs/BACKUPS.md", "docs/KNOWN_LIMITATIONS.md", "docs/PRODUCTION_RELEASE.md", "docs/WHITE_LABEL.md",
  "lib/auth-rate-limit.js", "lib/document-authorization.js", "lib/money.js", "lib/portal-handoff.js",
  "lib/workspace-localization.js", "lib/runtime-config.js", "lib/schema/core-schema.js",
  "lib/schema/security-migrations.js", "lib/schema/release-migrations.js", "lib/schema/localization-migrations.js", "lib/schema/money-migrations.js",
  "scripts/verify-secrets.js", "scripts/verify-auth-hardening.js", "scripts/verify-audit-hardening.js",
  "scripts/verify-authorization.js", "scripts/verify-verticals.js", "scripts/verify-compose.js", "scripts/verify-integration.js",
  "scripts/container-gate.js", "scripts/local-gate.js", "bun.lock"
]) requireFile(file);

if (fs.existsSync("docker-compose.yml")) failures.push("docker-compose.yml: obsolete duplicate remains");
if (fs.existsSync("brand-assets/NivasaOS_Brand_Assets.zip")) failures.push("brand-assets: duplicated binary archive remains");

const packageJson = JSON.parse(read("package.json"));
const lockfile = read("bun.lock");
if (packageJson.version !== "1.1.0") failures.push("package.json: expected version 1.1.0");
if (!/"lockfileVersion"\s*:\s*1/.test(lockfile) || !/"next"\s*:\s*"16\.2\.10"/.test(lockfile)) failures.push("bun.lock: dependency graph is not pinned");
const privateRegistryMarkers = ["applied-" + "caas", "internal.api." + "openai.org"];
if (privateRegistryMarkers.some((marker) => lockfile.includes(marker))) failures.push("bun.lock: contains environment-specific registry URLs");

const requiredScripts = [
  "setup:token", "audit:dependencies", "verify:secrets", "verify:source", "verify:schema", "verify:auth", "verify:operations", "verify:ui",
  "verify:authorization", "verify:portal", "verify:handover", "verify:modules", "verify:verticals", "verify:integration",
  "verify:compose", "verify:hardening", "verify:release", "gate", "gate:container"
];
for (const script of requiredScripts) if (!packageJson.scripts?.[script]) failures.push(`package.json: missing ${script}`);
const mandatoryVerifySteps = requiredScripts.filter((script) => script.startsWith("verify:") && script !== "verify:release");
for (const script of mandatoryVerifySteps) {
  if (!packageJson.scripts.verify.includes(`bun run ${script}`)) failures.push(`package.json: repository verify chain omits ${script}`);
}
if (!packageJson.scripts.verify.startsWith("bun run verify:secrets")) failures.push("package.json: secret verification must run first");
if (!packageJson.scripts.verify.endsWith("bun run verify:release")) failures.push("package.json: release verification must run last");
if (packageJson.scripts["audit:dependencies"] !== "bun audit --prod --audit-level=high") failures.push("package.json: dependency audit contract changed");
if (packageJson.scripts.build !== "bun --bun next build --webpack") failures.push("package.json: production build contract changed");

const contracts = {
  "app/api/lease-documents/[id]/route.js": ["canDeliverLeaseDocument", "hasPermission", "archived_at IS NULL"],
  "lib/document-authorization.js": ["handover.manage", "authorize(permission", "propertyId"],
  "app/(workspace)/tenant-portal/workspace.js": ["PORTAL_HANDOFF_COOKIE", "hashPortalToken(parsedHandoff.token)", "ti.consumed_at IS NULL", "portal/activate"],
  "lib/portal-handoff.js": ["nivasa_portal_invite_handoff", "httpOnly: true", "sameSite: \"strict\"", "PORTAL_HANDOFF_MAX_AGE_SECONDS"],
  "lib/actions/auth.js": ["loginThrottleContext", "verifyPasswordOrDummy", "retryAfter === 0 && !legacyLocked ?", "passwordInput", "legacyLocked", "assertTimeZone", "installation_state"],
  "lib/actions/portal-accounts.js": ["PORTAL_HANDOFF_COOKIE", "encodePortalInviteHandoff", "retryAfter === 0 && !legacyLocked ?", "passwordInput", "legacyLocked"],
  "lib/actions/finance-payments.js": ["moneyInput", "toMinorUnits", "currentPaid"],
  "lib/actions/portal-payments.js": ["moneyInput", "toMinorUnits", "status='pending'"],
  "lib/actions/portal-deposits.js": ["moneyInput", "CAST(ROUND(amount*100) AS INTEGER)"],
  "lib/actions/verticals.js": ["validDate(zoned[1]", "sameStatus", "currentStatus", "created.length", "(0[1-9]|1[0-2])"],
  "lib/actions/settings.js": ["invalidateWorkspaceLocalizationCache"],
  "lib/db.js": ["applySecurityMigrations(database)", "applyReleaseMigrations(database)", "applyLocalizationMigrations(database)", "applyMoneyMigrations(database)"],
  "lib/schema/core-schema.js": ["CREATE TABLE IF NOT EXISTS auth_rate_limits"],
  "lib/schema/localization-migrations.js": ["SELECT 'timezone','UTC'"],
  "lib/schema/money-migrations.js": ["MONEY_COLUMNS", "assertHistoricalScale", "money_scale_contract", "two decimal places"],
  "lib/auth-rate-limit.js": ["auth_rate_limits", "dimension: \"account\"", "dimension: \"network\"", "expiredLock"],
  "lib/money.js": ["MAX_MONEY_MINOR", "NUMERIC_NOISE_TOLERANCE", "BigInt", "supported monetary range"],
  "lib/workspace-localization.js": ["zonedDateTimeToIso", "invalidateWorkspaceLocalizationCache"],
  "lib/format.js": ["normalizedTimestamp", "workspaceTimeZone"],
  "scripts/verify-integration.js": ["applyLocalizationMigrations", "applyMoneyMigrations", "historical sub-cent values", "PRAGMA integrity_check"],
  "scripts/verify-audit-hardening.js": ["canDeliverLeaseDocument", "Large adjacent cent values", "Money helper rejected ordinary SQLite REAL aggregate noise", "'nonce-${nonce}'"],
  "scripts/verify-compose.js": ["caddy:2.11.4-alpine", "request nonce CSP", "exact security-header values"],
  ".circleci/config.yml": ["oven/bun:1.3.0", "bun run audit:dependencies", "bun run gate", "bun run gate:container"],
  "compose.production.yml": ["caddy:2.11.4-alpine", "NIVASA_DOMAIN:", "condition: service_healthy"],
  "Caddyfile": ["header_up X-Nivasa-Client-IP {remote_host}", "X-Frame-Options \"DENY\""],
  "next.config.mjs": ["X-Frame-Options", "DENY", "Permissions-Policy"],
  "proxy.js": ["randomUUID", "x-nonce", "'nonce-${nonce}'", "'strict-dynamic'", "default-src 'self'", "frame-ancestors 'none'"],
  "app/layout.js": ["await headers()"],
  "README.md": ["NivasaOS 1.1", "technical preview", "application append-only", "gate:container"],
  "SECURITY.md": ["network throttling", "minor-unit", "file-delivery"],
  "CHANGELOG.md": ["## Unreleased", "## 1.1.0 - 2026-07-18", "## 0.1.0 - 2026-07-16"],
  "docs/KNOWN_LIMITATIONS.md": ["minor-unit", "In-memory backup implementation", "Verification boundary"],
  "docs/PRODUCTION_RELEASE.md": ["backup and restore recovery", "CircleCI evidence", "audit:dependencies"],
  "docs/WHITE_LABEL.md": ["brand-assets/", "does not include a duplicated ZIP bundle"]
};
for (const [file, values] of Object.entries(contracts)) requireText(file, values);

if (read("Caddyfile").includes("Content-Security-Policy")) failures.push("Caddyfile: must not override the per-request nonce CSP");
if (read("next.config.mjs").includes("Content-Security-Policy")) failures.push("next.config.mjs: static headers must not override the per-request nonce CSP");
const responsive = read("app/styles/part-12.css");
for (const value of ["@media (max-width: 820px)", "env(safe-area-inset-bottom)", ":focus-visible", "prefers-reduced-motion"]) {
  if (!responsive.includes(value)) failures.push(`responsive QA contract missing: ${value}`);
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("NivasaOS packaging, complete repository gate, registry hygiene, behavioral authorization, throttled authentication, exact money precision, localization migrations, workflow integrity, nonce CSP, container, dependency, governance, and release contracts are intact.");
