import fs from "node:fs";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const requireFile = (file) => {
  if (!fs.existsSync(file)) failures.push(`${file}: missing`);
};
const requireText = (file, values) => {
  requireFile(file);
  if (!fs.existsSync(file)) return;
  const source = read(file);
  for (const value of values) if (!source.includes(value)) failures.push(`${file}: missing ${value}`);
};

const releaseCriticalFiles = [
  "app/global-error.js",
  "app/error.js",
  "app/not-found.js",
  "app/loading.js",
  "app/(workspace)/error.js",
  "app/(workspace)/loading.js",
  "app/(workspace)/forbidden/page.js",
  "app/styles/system-states.css",
  "app/styles/records.css",
  "app/(workspace)/invoices/InvoiceTable.js",
  "components/SystemState.js",
  "components/SystemLoading.js",
  "lib/team-access.js",
  "scripts/build-diagnostics.js",
  "scripts/render-build-gate.sh",
  "scripts/verify-deployment-surfaces.js",
  "scripts/verify-team-access.js",
  "scripts/verify-browser-gate.js",
  "scripts/verify-mobile-records.js",
  "docs/RENDER_BUILD_EVIDENCE.md"
];
for (const file of releaseCriticalFiles) requireFile(file);

requireText("lib/team-access.js", ["canManageTeamMember", "assertDelegatedTeamTarget", "target.role !== \"staff\""]);
requireText("scripts/verify-team-access.js", ["Delegated managers must not expose administrator actions", "has_assignments", "verify-team-access.js"]);
requireText("scripts/build-diagnostics.js", ["[nivasa-build]", "nextPackage.version", "Build-time", "RENDER_GIT_COMMIT"]);
requireText("scripts/render-build-gate.sh", ["--capture-only", "--enforce-only", "build_status=${PIPESTATUS[0]}", "build-exit-code.txt"]);
requireText("docs/RENDER_BUILD_EVIDENCE.md", ["bun run gate:render", "first failing Docker layer", "does not replace an actual Render deployment"]);
requireText("app/global-error.js", ['"use client"', "<html lang=\"en\">", "reset()", "error?.digest"]);
requireText("app/(workspace)/forbidden/page.js", ["403", "Permission boundary", "No record was disclosed or changed"]);
requireText("components/SystemState.js", ["system-state-card", "system-state-reference", "primaryHref", "secondaryHref"]);
requireText("components/SystemLoading.js", ['role="status"', 'aria-busy="true"', "system-loading-metrics", "system-loading-panels"]);
requireText("app/styles/system-states.css", [".system-state-page", ".workspace-system-state", "@media (prefers-reduced-motion: reduce)"]);
requireText("app/styles/records.css", ["table[data-mobile-cards]", "content: attr(data-label)", "display: grid !important"]);

if (fs.existsSync("package.json")) {
  const packageJson = JSON.parse(read("package.json"));
  if (packageJson.scripts?.["build:diagnostics"] !== "bun run scripts/build-diagnostics.js") failures.push("package.json: build diagnostics command changed");
  if (packageJson.scripts?.["gate:render"] !== "bash scripts/render-build-gate.sh") failures.push("package.json: repository-owned Render build gate command changed");
  if (packageJson.scripts?.["verify:authorization"] !== "bun run scripts/verify-authorization.js && bun run scripts/verify-team-access.js") failures.push("package.json: Team access regression test is not part of authorization verification");
  if (packageJson.scripts?.["verify:completeness"] !== "bun run scripts/verify-release-completeness.js") failures.push("package.json: release completeness command changed");
  const releaseSteps = String(packageJson.scripts?.["verify:release"] || "").split(/\s*&&\s*/).filter(Boolean);
  if (releaseSteps.filter((step) => step === "bun run verify:completeness").length !== 1) failures.push("package.json: verify:release must execute release completeness exactly once");
  if (releaseSteps.at(-1) !== "bun run verify:completeness") failures.push("package.json: release completeness must be the final verify:release step");
} else {
  failures.push("package.json: missing");
}

if (fs.existsSync("app/(workspace)/invoices/InvoiceTable.js")) {
  const invoiceTable = read("app/(workspace)/invoices/InvoiceTable.js");
  const expectedLabels = ["Invoice", "Charge", "Tenant", "Property / unit", "Due", "Amount", "Balance", "Status", "Reminder", "Actions"];
  const labels = [...invoiceTable.matchAll(/<td\s+data-label="([^"]+)"/g)].map((match) => match[1]);
  if (!invoiceTable.includes('data-mobile-cards="invoices"')) failures.push("Invoice table is not opted into the shared mobile record-card contract");
  if (JSON.stringify(labels) !== JSON.stringify(expectedLabels)) failures.push(`Invoice mobile labels must exactly equal ${expectedLabels.join(", ")}; found ${labels.join(", ") || "none"}`);
}

if (fs.existsSync("scripts/verify-mobile-records.js") && !read("scripts/verify-mobile-records.js").includes('["app/(workspace)/invoices/InvoiceTable.js", "invoices", 10]')) {
  failures.push("scripts/verify-mobile-records.js: invoice register must require all ten mobile field labels");
}
if (fs.existsSync("scripts/verify-browser-gate.js")) {
  const browserVerifier = read("scripts/verify-browser-gate.js");
  for (const value of ["app/styles/records.css", "content: attr(data-label)", "expectedInvoiceLabels"]) {
    if (!browserVerifier.includes(value)) failures.push(`scripts/verify-browser-gate.js: missing shared invoice contract ${value}`);
  }
  if (browserVerifier.includes('.invoices-table td:nth-child')) failures.push("scripts/verify-browser-gate.js: stale positional invoice-label contract returned");
}
if (fs.existsSync("scripts/verify-ui.js") && read("scripts/verify-ui.js").includes('contains(teamPage, "const manageable="')) {
  failures.push("scripts/verify-ui.js: whitespace-sensitive Team manager assertion returned");
}
if (fs.existsSync("app/styles/finance.css") && read("app/styles/finance.css").includes(".invoices-table td:nth-child")) {
  failures.push("app/styles/finance.css: duplicated positional invoice labels conflict with the shared data-label system");
}
if (fs.existsSync("scripts/verify-deployment-surfaces.js")) {
  const deploymentVerifier = read("scripts/verify-deployment-surfaces.js");
  if (!deploymentVerifier.includes("verify-release-completeness.js") || !deploymentVerifier.includes("verify:completeness")) failures.push("scripts/verify-deployment-surfaces.js: release completeness is not anchored by an earlier deployment gate");
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Recently added deployment recovery, Team access, Render evidence, build diagnostics, shared invoice mobile records, and anti-drift release contracts are fully inventoried and anchored.");
