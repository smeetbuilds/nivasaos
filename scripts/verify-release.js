import fs from "node:fs";

const requiredFiles = [
  "app/(workspace)/operations/page.js",
  "app/(workspace)/reservations/page.js",
  "app/(workspace)/housekeeping/page.js",
  "app/portal/(account)/requests/page.js",
  "app/styles/part-12.css",
  "docs/PRODUCTION_RELEASE.md",
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
if (lockfile.includes("applied-caas") || lockfile.includes("internal.api.openai.org")) failures.push("bun.lock: contains environment-specific registry URLs");

if (packageJson.version !== "1.0.0") failures.push("package.json: expected version 1.0.0");
for (const script of ["verify:verticals", "verify:release", "gate"]) if (!packageJson.scripts?.[script]) failures.push(`package.json: missing ${script}`);
if (!packageJson.scripts.verify.includes("verify:verticals") || !packageJson.scripts.verify.includes("verify:release")) failures.push("package.json: complete verification chain is not wired");

const contracts = {
  "app/globals.css": ["part-12.css"],
  "app/(workspace)/layout.js": ["portfolioPermissionsForUser"],
  "app/actions.js": ["propertyRelease.updatePropertyReleaseAction"],
  "lib/db.js": ["applyReleaseMigrations(database)"],
  "lib/schema/release-migrations.js": ["is_customized", "trg_properties_module_reset_defaults", "trg_hostel_reservation_overlap_insert", "trg_space_allocation_reservation_insert", "idx_permission_grants_global_unique", "schema_release"],
  "lib/actions/property-module-update.js": ["is_customized=1", "operatingDefaultsReset"],
  "lib/actions/verticals.js": ["reservationOverlap", "bulkServiceBillingAction", "idempotencyKey"],
  "scripts/local-gate.js": ["/api/health", "/install", "/dashboard", "without GitHub Actions"],
  "README.md": ["NivasaOS 1.0", "verify:verticals", "PRODUCTION_RELEASE.md"],
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
console.log("NivasaOS 1.0 release wiring, responsive contracts, self-hosted gate, documentation, and verification chain verified.");
