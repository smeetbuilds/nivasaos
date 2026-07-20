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
  "scripts/verify-money-storage.js", "scripts/verify-operations.js", "scripts/lib/tar-archive.js", "scripts/lib/operations.js",
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

const expectedVerifyScripts = [
  "verify:secrets", "verify:source", "verify:schema", "verify:auth", "verify:operations", "verify:money", "verify:ui",
  "verify:authorization", "verify:portal", "verify:handover", "verify:modules", "verify:verticals", "verify:integration",
  "verify:compose", "verify:hardening", "verify:remediation", "verify:release"
];
const requiredScripts = ["setup:token", "audit:dependencies", ...expectedVerifyScripts, "gate", "gate:container"];
for (const script of requiredScripts) if (!packageJson.scripts?.[script]) failures.push(`package.json: missing ${script}`);
const expectedVerifyChain = expectedVerifyScripts.map((script) => `bun run ${script}`);
const actualVerifySource = String(packageJson.scripts.verify || "").trim();
const actualVerifyChain = actualVerifySource ? actualVerifySource.split(/\s*&&\s*/).map((step) => step.trim()) : [];
if (JSON.stringify(actualVerifyChain) !== JSON.stringify(expectedVerifyChain)) {
  failures.push(`package.json: verify chain must exactly equal ${expectedVerifyChain.join(" && ")}`);
}
if (/[|;]|\btrue\b|\bexit\s+0\b/.test(actualVerifySource)) failures.push("package.json: verify chain contains an unsafe shell bypass or extra operator");
if (packageJson.scripts["audit:dependencies"] !== "bun audit --prod --audit-level=high") failures.push("package.json: dependency audit contract changed");
if (packageJson.scripts.build !== "bun --bun next build --webpack") failures.push("package.json: production build contract changed");

const contracts = {
  "app/api/lease-documents/[id]/route.js": ["canDeliverLeaseDocument", "hasPermission", "archived_at IS NULL"],
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
  "lib/db.js": ["applySecurityMigrations(database)", "applyReleaseMigrations(database)", "applyLocalizationMigrations(database)", "applyMoneyMigrations(database)"],
  "lib/schema/core-schema.js": ["CREATE TABLE IF NOT EXISTS auth_rate_limits"],
  "lib/schema/localization-migrations.js": ["SELECT 'timezone','UTC'"],
  "lib/schema/money-migrations.js": ["MONEY_SCALE_CONTRACT_VERSION", "MONEY_MINOR_MIRROR_VERSION", "MONEY_MAX_MINOR", "ensureMinorMirror", "money_minor_mirror_contract"],
  "lib/auth-rate-limit.js": ["auth_rate_limits", "dimension: \"account\"", "dimension: \"network\"", "windowStarted <= nowMs - item.windowMs"],
  "lib/money.js": ["MAX_MONEY_MINOR", "NUMERIC_NOISE_TOLERANCE", "BigInt", "supported monetary range"],
  "lib/workspace-localization.js": ["zonedDateTimeToIso", "setUTCFullYear", "invalidateWorkspaceLocalizationCache"],
  "lib/format.js": ["normalizedTimestamp", "catch { return \"\"; }", "workspaceTimeZone"],
  "scripts/verify-integration.js": ["applyLocalizationMigrations", "applyMoneyMigrations", "historical sub-cent values", "PRAGMA integrity_check"],
  "scripts/verify-money-storage.js": ["money_minor_mirror_contract", "monthly_rate_minor", "Direct minor-unit mismatch", "Out-of-range money value"],
  "scripts/verify-operations.js": ["formatVersion === 2", "maxEntryBytes: 1", "pre-activation restore failure", "Archive writer accepted a traversal path"],
  "scripts/lib/tar-archive.js": ["createGzip", "createGunzip", "maxExpandedBytes", "maxEntryBytes", "maxEntries", "safeDestination"],
  "scripts/lib/operations.js": ["VACUUM INTO", "formatVersion: FORMAT_VERSION", "upload checksum", "databaseInstalled", "uploadsInstalled"],
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
  "CHANGELOG.md": ["## Unreleased", "streamed", "minor-unit mirror", "## 1.1.0 - 2026-07-18", "## 0.1.0 - 2026-07-16"],
  "docs/KNOWN_LIMITATIONS.md": ["minor-unit mirror", "Bounded streaming backup implementation", "Verification boundary"],
  "docs/PRODUCTION_RELEASE.md": ["backup and restore recovery", "bounded streaming", "CircleCI evidence", "audit:dependencies"],
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
console.log("NivasaOS packaging, exact repository gate, registry hygiene, authenticated handoff, throttled authentication, bounded money migrations, exact minor-unit mirrors, bounded streaming recovery, scale-safe aggregates, localization, workflow integrity, nonce CSP, container, dependency, governance, and release contracts are intact.");
