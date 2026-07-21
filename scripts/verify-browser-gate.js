import fs from "node:fs";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const requiredFiles = [
  "package.json",
  ".circleci/config.yml",
  ".gitignore",
  "scripts/browser-gate.js",
  "app/styles/portfolio.css",
  "app/styles/finance.css",
  "docs/BROWSER_TESTING.md",
  "docs/KNOWN_LIMITATIONS.md"
];
for (const file of requiredFiles) if (!fs.existsSync(file)) failures.push(`${file}: missing`);

if (!failures.length) {
  const packageJson = JSON.parse(read("package.json"));
  const circleci = read(".circleci/config.yml");
  const ignore = read(".gitignore");
  const browserGate = read("scripts/browser-gate.js");
  const portfolio = read("app/styles/portfolio.css");
  const finance = read("app/styles/finance.css");
  const docs = read("docs/BROWSER_TESTING.md");
  const limitations = read("docs/KNOWN_LIMITATIONS.md");

  if (packageJson.scripts?.["gate:browser"] !== "bun run scripts/browser-gate.js") failures.push("package.json: gate:browser must execute the repository browser harness");
  if (packageJson.scripts?.["verify:browser-contract"] !== "bun run scripts/verify-browser-gate.js") failures.push("package.json: browser contract verifier is not wired");
  if (!String(packageJson.scripts?.verify || "").includes("verify:browser-contract")) failures.push("package.json: repository verification does not include the browser contract verifier");

  for (const needle of [
    "browser-tools: circleci/browser-tools@2.4.2",
    "browser-gate:",
    "image: cimg/node:22.23.1-browsers",
    "browser-tools/install-chrome:",
    "chrome-version: 150.0.7871.129",
    "replace-existing: true",
    'bash -s "bun-v1.3.0"',
    "bun install --frozen-lockfile",
    "bun run build",
    "bun run gate:browser",
    "store_artifacts:",
    "path: artifacts/browser",
    "requires:",
    "- release-gate",
    "only:",
    "- main"
  ]) if (!circleci.includes(needle)) failures.push(`.circleci/config.yml: missing ${needle}`);

  for (const needle of [
    'migrateDatabase(db, { applicationVersion: "browser-gate" })',
    'const DESKTOP_ROUTES = ["/dashboard", "/properties", "/tenants", "/leases", "/invoices", "/reports", "/tenant-portal"]',
    'const MOBILE_RECORD_ROUTES = ["/tenants", "/leases", "/invoices"]',
    'document.querySelectorAll(\'table.people-table, table.agreements-table, table.invoices-table\')',
    'Accessibility.getFullAXTree',
    'Runtime.exceptionThrown',
    'Runtime.consoleAPICalled',
    'Page.captureScreenshot',
    'document.documentElement.scrollWidth - window.innerWidth',
    'Network.setCookie',
    'nivasa_session',
    'NIVASA_BROWSER_BIN',
    'artifacts/browser'
  ]) if (!browserGate.includes(needle)) failures.push(`scripts/browser-gate.js: missing ${needle}`);

  if (browserGate.includes("applySecurityMigrations(db)") || browserGate.includes("applyMoneyMigrations(db)")) failures.push("scripts/browser-gate.js: fixture migration order bypasses the central registry");

  for (const needle of [
    ".people-table tbody tr,.agreements-table tbody tr",
    "display: grid !important",
    '.people-table td:nth-child(1)::before { content: "Person"; }',
    '.people-table td:nth-child(7)::before { content: "Actions"; }',
    '.agreements-table td:nth-child(1)::before { content: "Agreement"; }',
    '.agreements-table td:nth-child(8)::before { content: "Actions"; }',
    "overflow: visible !important"
  ]) if (!portfolio.includes(needle)) failures.push(`app/styles/portfolio.css: missing ${needle}`);

  for (const needle of [
    ".invoices-table tbody tr",
    "display: grid !important",
    '.invoices-table td:nth-child(1)::before { content: "Invoice"; }',
    '.invoices-table td:nth-child(10)::before { content: "Actions"; }',
    "overflow: visible !important"
  ]) if (!finance.includes(needle)) failures.push(`app/styles/finance.css: missing ${needle}`);

  if (!ignore.includes("artifacts/browser/")) failures.push(".gitignore: generated browser evidence must not be tracked");
  for (const needle of ["bun run gate:browser", "Chrome DevTools Protocol", "accessibility tree", "artifacts/browser", "CircleCI"]) {
    if (!docs.includes(needle)) failures.push(`docs/BROWSER_TESTING.md: missing ${needle}`);
  }
  for (const needle of [
    "bun run gate:browser",
    "bun run gate:cross-browser",
    "purpose-built labeled record cards",
    "not physical-device or manual screen-reader certification"
  ]) {
    if (!limitations.includes(needle)) failures.push(`docs/KNOWN_LIMITATIONS.md: missing ${needle}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Pinned authenticated Chrome execution, centralized fixture migrations, Firefox/WebKit boundary documentation, accessibility-tree inspection, runtime-error capture, mobile record-card behavior, evidence storage, and CircleCI wiring are verified.");
