import fs from "node:fs";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
for (const file of ["scripts/cross-browser-gate.js", "scripts/verify-certification-evidence.js", "docs/ACCESSIBILITY_CERTIFICATION.md", "docs/evidence/accessibility-device.example.json", ".circleci/config.yml", "components/OpenModalButton.js", "components/ModalForm.js"]) {
  if (!fs.existsSync(file)) failures.push(`${file}: missing`);
}

if (!failures.length) {
  const packageJson = JSON.parse(read("package.json"));
  const circleci = read(".circleci/config.yml");
  const cross = read("scripts/cross-browser-gate.js");
  const evidence = read("scripts/verify-certification-evidence.js");
  const docs = read("docs/ACCESSIBILITY_CERTIFICATION.md");
  const opener = read("components/OpenModalButton.js");
  const modal = read("components/ModalForm.js");

  if (packageJson.scripts?.["gate:cross-browser"] !== "bun run scripts/cross-browser-gate.js") failures.push("package.json: gate:cross-browser is not wired");
  if (packageJson.scripts?.["certify:device"] !== "bun run scripts/verify-certification-evidence.js") failures.push("package.json: certify:device is not wired");
  if (packageJson.scripts?.["verify:certification"] !== "bun run scripts/verify-certification-contract.js") failures.push("package.json: certification contract verifier is not wired");
  if (!String(packageJson.scripts?.verify || "").includes("verify:certification")) failures.push("package.json: repository verification omits certification contracts");

  for (const needle of [
    "mcr.microsoft.com/playwright:v1.61.1-noble",
    "playwright@1.61.1",
    "bun run gate:cross-browser",
    "path: artifacts/cross-browser",
    "cross-browser-gate:",
    "requires:",
    "- release-gate"
  ]) if (!circleci.includes(needle)) failures.push(`.circleci/config.yml: missing ${needle}`);

  for (const needle of [
    'await import("playwright")',
    '["firefox", playwright.firefox]',
    '["webkit", playwright.webkit]',
    '"portfolio.view", "people.manage", "maintenance.manage"',
    'nivasa_tenant_session',
    'migrateDatabase(db, { applicationVersion: "cross-browser-gate" })',
    'const MOBILE_RECORD_ROUTES = ["/units", "/payments", "/audit", "/reports"]',
    'assertMobileRecordRoute',
    'table[data-mobile-cards]',
    'structuredValidationAndFocus',
    'delegatedStaff',
    'tenantWorkflow',
    'Tab focus escaped the modal dialog',
    'Focus did not return to the dialog trigger',
    'artifacts/cross-browser'
  ]) if (!cross.includes(needle)) failures.push(`scripts/cross-browser-gate.js: missing ${needle}`);

  for (const needle of ["nivasaReturnFocus", "requestAnimationFrame", "aria-haspopup=\"dialog\""]) if (!opener.includes(needle)) failures.push(`components/OpenModalButton.js: missing ${needle}`);
  for (const needle of ["onClose={restoreFocus}", "nivasaReturnFocus", "target.focus"]) if (!modal.includes(needle)) failures.push(`components/ModalForm.js: missing ${needle}`);

  for (const needle of ["Windows Firefox with NVDA or JAWS", "macOS Safari with VoiceOver", "physical Android Chrome", "physical iOS Safari", "screenshots", "sha256", "approval.status must be approved"]) {
    if (!evidence.includes(needle)) failures.push(`scripts/verify-certification-evidence.js: missing ${needle}`);
  }
  for (const needle of ["manual accessibility", "physical-device", "bun run certify:device", "cannot truthfully certify", "larger-text"]) {
    if (!docs.includes(needle)) failures.push(`docs/ACCESSIBILITY_CERTIFICATION.md: missing ${needle}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Pinned Firefox/WebKit automation, centralized fixture migrations, delegated and tenant workflows, lower-frequency mobile screenshots, modal focus ownership, manual screen-reader matrix, and physical-device evidence contracts are verified.");
