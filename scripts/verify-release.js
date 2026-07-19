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
  "Caddyfile", "Dockerfile", ".dockerignore", "compose.yml", "compose.production.yml",
  "docs/BACKUPS.md", "docs/KNOWN_LIMITATIONS.md", "docs/PRODUCTION_RELEASE.md",
  "lib/auth-rate-limit.js", "lib/money.js", "lib/workspace-localization.js", "lib/runtime-config.js",
  "lib/schema/security-migrations.js", "lib/schema/release-migrations.js", "lib/schema/money-migrations.js",
  "scripts/verify-secrets.js", "scripts/verify-auth-hardening.js", "scripts/verify-audit-hardening.js",
  "scripts/verify-authorization.js", "scripts/verify-compose.js", "scripts/verify-integration.js",
  "scripts/container-gate.js", "scripts/local-gate.js", "bun.lock"
]) requireFile(file);

if (fs.existsSync("docker-compose.yml")) failures.push("docker-compose.yml: obsolete duplicate remains");
if (fs.existsSync("brand-assets/NivasaOS_Brand_Assets.zip")) failures.push("brand-assets: duplicated binary archive remains");

const packageJson = JSON.parse(read("package.json"));
const lockfile = read("bun.lock");
if (packageJson.version !== "1.1.0") failures.push("package.json: expected version 1.1.0");
if (!/"lockfileVersion"\s*:\s*1/.test(lockfile) || !/"next"\s*:\s*"16\.2\.10"/.test(lockfile)) failures.push("bun.lock: dependency graph is not pinned");
for (const script of ["audit:dependencies", "verify:secrets", "verify:auth", "verify:authorization", "verify:integration", "verify:compose", "verify:hardening", "verify:release", "gate", "gate:container"]) {
  if (!packageJson.scripts?.[script]) failures.push(`package.json: missing ${script}`);
}
if (!packageJson.scripts.verify.startsWith("bun run verify:secrets")) failures.push("package.json: secret verification must run first");
if (!packageJson.scripts.verify.includes("bun run verify:hardening")) failures.push("package.json: hardening verification is not in the gate");
if (packageJson.scripts["audit:dependencies"] !== "bun audit --prod --audit-level=high") failures.push("package.json: dependency audit contract changed");
if (packageJson.scripts.build !== "bun --bun next build --webpack") failures.push("package.json: production build contract changed");

const contracts = {
  "app/api/lease-documents/[id]/route.js": ["handover.manage", "hasPermission", "archived_at IS NULL"],
  "app/(workspace)/tenant-portal/workspace.js": ["nivasa_portal_invite_handoff", "portal/activate"],
  "lib/actions/auth.js": ["loginThrottleContext", "verifyPasswordOrDummy", "assertTimeZone", "installation_state"],
  "lib/actions/portal-accounts.js": ["PORTAL_HANDOFF_COOKIE", "httpOnly: true", "sameSite: \"strict\""],
  "lib/actions/finance-payments.js": ["moneyInput", "toMinorUnits", "currentPaid"],
  "lib/actions/portal-payments.js": ["moneyInput", "toMinorUnits", "status='pending'"],
  "lib/actions/portal-deposits.js": ["moneyInput", "toMinorUnits"],
  "lib/actions/verticals.js": ["currentStatus", "created.length", "(0[1-9]|1[0-2])"],
  "lib/db.js": ["applySecurityMigrations(database)", "applyReleaseMigrations(database)", "applyMoneyMigrations(database)"],
  "lib/auth-rate-limit.js": ["auth_rate_limits", "dimension: \"account\"", "dimension: \"network\""],
  "lib/schema/money-migrations.js": ["MONEY_COLUMNS", "money_scale_contract", "two decimal places"],
  "scripts/verify-integration.js": ["applyMoneyMigrations", "more than two decimals", "PRAGMA integrity_check"],
  "scripts/verify-compose.js": ["caddy:2.11.4-alpine", "proxy environment isolation"],
  ".circleci/config.yml": ["oven/bun:1.3.0", "bun run audit:dependencies", "bun run gate", "bun run gate:container"],
  "compose.production.yml": ["caddy:2.11.4-alpine", "NIVASA_DOMAIN:", "condition: service_healthy"],
  "Caddyfile": ["Content-Security-Policy", "Permissions-Policy", "Strict-Transport-Security"],
  "README.md": ["NivasaOS 1.1", "technical preview", "application append-only", "gate:container"],
  "SECURITY.md": ["network throttling", "minor-unit", "file-delivery"],
  "CHANGELOG.md": ["## Unreleased", "## 1.1.0 - 2026-07-18", "## 0.1.0 - 2026-07-16"],
  "docs/KNOWN_LIMITATIONS.md": ["minor-unit", "In-memory backup implementation", "Verification boundary"],
  "docs/PRODUCTION_RELEASE.md": ["backup and restore recovery", "CircleCI evidence", "audit:dependencies"]
};
for (const [file, values] of Object.entries(contracts)) requireText(file, values);

const responsive = read("app/styles/part-12.css");
for (const value of ["@media (max-width: 820px)", "env(safe-area-inset-bottom)", ":focus-visible", "prefers-reduced-motion"]) {
  if (!responsive.includes(value)) failures.push(`responsive QA contract missing: ${value}`);
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("NivasaOS packaging, security, authorization, money precision, localization, integration, container, dependency, governance, and release contracts are intact.");
