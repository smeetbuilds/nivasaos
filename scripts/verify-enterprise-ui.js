import fs from "node:fs";

const read = (filename) => fs.readFileSync(filename, "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contains = (source, value, message) => assert(source.includes(value), message);
const excludes = (source, value, message) => assert(!source.includes(value), message);

const globals = read("app/globals.css");
const legacyIndex = read("app/styles/legacy/index.css");
const foundation = read("app/styles/foundation.css");
const portfolio = read("app/styles/portfolio.css");
const finance = read("app/styles/finance.css");
const operationsCss = read("app/styles/operations.css");
const dashboardCss = read("app/styles/dashboard.css");
const polish = read("app/styles/polish.css");
const shell = read("components/AppShell.js");
const pageHeader = read("components/PageHeader.js");
const dashboard = read("app/(workspace)/dashboard/page.js");
const properties = read("app/(workspace)/properties/page.js");
const people = read("app/(workspace)/tenants/page.js");
const agreements = read("app/(workspace)/leases/page.js");
const invoices = read("app/(workspace)/invoices/page.js");
const invoiceTable = read("app/(workspace)/invoices/InvoiceTable.js");
const payments = read("app/(workspace)/payments/page.js");
const billing = read("app/(workspace)/billing/page.js");
const reports = read("app/(workspace)/reports/workspace.js");
const maintenance = read("app/(workspace)/maintenance/page.js");
const reservations = read("app/(workspace)/reservations/page.js");

for (const filename of ["legacy/index.css", "part-12.css", "part-13.css", "foundation.css", "portfolio.css", "finance.css", "operations.css", "dashboard.css", "polish.css"]) {
  contains(globals, `@import "./styles/${filename}";`, `Global CSS must load ${filename}.`);
}
contains(globals.trim(), '@import "./styles/polish.css";', "The visual-coherence stylesheet must remain the final CSS import.");
excludes(globals, "part-14.css", "Anonymous enterprise stylesheet imports must be retired.");
excludes(globals, "part-15.css", "Anonymous portfolio stylesheet imports must be retired.");
contains(legacyIndex, '@import "./part-1.css";', "Legacy CSS must preserve the first compatibility slice.");
contains(legacyIndex, '@import "./part-11.css";', "Legacy CSS must preserve the final frozen compatibility slice.");
excludes(legacyIndex, "part-12.css", "Release QA contracts must remain explicit top-level imports.");
for (const token of ["--ink: #101828", "--line: #e4e7ec", "--accent: #465fff", "--radius: 12px"]) {
  contains(foundation, token, `Enterprise design token missing: ${token}`);
}
contains(foundation, ".app-shell { grid-template-columns: 276px", "Desktop information architecture width is missing.");
contains(foundation, ".sidebar-context", "Workspace context styling is missing.");
contains(foundation, ".table-wrap tbody tr:hover", "Enterprise table interaction state is missing.");
contains(foundation, "@media (max-width: 960px)", "Tablet and mobile shell breakpoint is missing.");
contains(foundation, "@media (prefers-reduced-motion: reduce)", "Reduced-motion accessibility handling is missing.");
excludes(foundation, ".button.primary {\n  background: linear-gradient", "Primary actions must not use decorative gradients.");

for (const contract of [
  ".page-header {",
  ".metric-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }",
  ".module-health-grid { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }",
  ".vertical-property-card::after { display: none; }",
  ".permission-card small",
  ".modal[open] { display: grid;",
  ".mobile-bottom-nav :is(a, button).is-active",
  "@media (max-width: 720px)",
  "@media (prefers-reduced-motion: reduce)"
]) contains(polish, contract, `System polish contract missing: ${contract}`);
excludes(polish, "font-size: 8px", "Final polish must not reintroduce unreadably small operational text.");
excludes(polish, "border-radius: 20px", "Final polish must not reintroduce oversized card radii.");

for (const contract of [
  ".metric-grid.executive-metrics",
  ".dashboard-grid.dashboard-primary-grid",
  ".dashboard-grid.dashboard-followups",
  ".dashboard-empty-state",
  ".dashboard-invoice-table",
  ".module-health-card .module-health-stats",
  "@media (max-width: 720px)"
]) contains(dashboardCss, contract, `Dashboard polish contract missing: ${contract}`);
contains(dashboard, 'aria-label="Portfolio summary"', "Dashboard metrics need an accessible summary label.");
contains(dashboard, 'aria-labelledby="operating-model-health-title"', "Operating-model health needs a stable section heading relationship.");
contains(dashboard, "primaryPanelCount > 0", "Dashboard must not render an empty operational grid for restricted roles.");
contains(dashboard, "followupPanelCount > 0", "Dashboard must not render an empty follow-up grid for restricted roles.");
contains(dashboard, "data-mobile-cards", "Recent invoices must use the shared mobile record-card contract.");
contains(dashboard, 'data-label="Invoice"', "Dashboard invoice rows need explicit mobile labels.");
contains(dashboard, "dashboard-empty-state", "Dashboard panels need intentional empty states.");
excludes(dashboard, 'className="panel span-2"', "Recent invoices must not force maintenance into an orphaned second row.");

contains(shell, "sidebar-context", "Desktop navigation must expose the active workspace context.");
contains(shell, '{current?.[2] || "Workspace"}', "Topbar must expose the current operational area.");
contains(shell, "{user.role}", "User identity must expose role rather than an abstract permission count.");
contains(pageHeader, "page-header-copy", "Page headings require a stable copy container.");
contains(pageHeader, 'className = ""', "Page headings must support page-level composition without duplicated markup.");
contains(dashboard, 'title="Portfolio overview"', "Dashboard must use a task-oriented enterprise title.");
contains(dashboard, "Operating model health", "Dashboard module section must use operational language.");

contains(portfolio, ".portfolio-toolbar", "Portfolio directories require a shared filter toolbar.");
contains(portfolio, ".portfolio-summary-grid", "Portfolio pages require decision-oriented summary metrics.");
contains(properties, 'aria-label="Property portfolio summary"', "Properties require an operational summary.");
contains(properties, 'aria-label="Filter properties"', "Properties require URL-shareable filters.");
contains(people, 'aria-label="People directory summary"', "People require an operational summary.");
contains(people, 'aria-label="Filter people"', "People require URL-shareable filters.");
contains(agreements, 'aria-label="Agreement portfolio summary"', "Agreements require an operational summary.");
contains(agreements, 'aria-label="Filter agreements"', "Agreements require URL-shareable filters.");
contains(agreements, "moduleOptions", "Agreement model filtering must retain historical operating models.");

contains(finance, ".finance-toolbar", "Finance directories require a shared filter toolbar.");
contains(finance, ".finance-command-grid", "Finance operations require command-centre hierarchy.");
contains(finance, ".finance-policy-grid", "Billing policy views require an enterprise card grid.");
contains(finance, ".report-dashboard-grid", "Reports require a structured intelligence layout.");
contains(invoices, 'aria-label="Receivables summary"', "Invoices require a receivables summary.");
contains(invoiceTable, 'aria-label="Filter invoices"', "Invoices require accessible filters.");
contains(payments, 'aria-label="Payment collection summary"', "Payments require a currency-safe collection summary.");
contains(payments, 'aria-label="Filter payments"', "Payments require URL-shareable filters.");
contains(billing, 'aria-label="Billing policy summary"', "Billing policies require an operational summary.");
contains(billing, 'aria-label="Filter billing policies"', "Billing policies require URL-shareable filters.");
contains(reports, 'aria-label="Reporting summary"', "Reports require an intelligence summary.");
contains(reports, 'aria-label="Filter reports by property"', "Reports require one explicit scope control.");

contains(operationsCss, ".operations-toolbar", "Maintenance and reservation views require a shared filter toolbar.");
contains(operationsCss, ".enterprise-kanban", "Maintenance requires a responsive operational board.");
contains(operationsCss, ".enterprise-reservation-board", "Reservations require a responsive front-desk board.");
contains(operationsCss, "@media (prefers-reduced-motion: reduce)", "Operations must respect reduced-motion preferences.");
contains(maintenance, 'aria-label="Maintenance workload summary"', "Maintenance requires workload metrics.");
contains(maintenance, 'aria-label="Filter maintenance tickets"', "Maintenance requires URL-shareable filters.");
contains(maintenance, "<ActionButton", "Maintenance transitions must retain pending states.");
contains(reservations, 'aria-label="Reservation operations summary"', "Reservations require front-desk metrics.");
contains(reservations, 'aria-label="Filter reservations"', "Reservations require URL-shareable filters.");
contains(reservations, "<TransitionConfirmation", "Reservation destructive transitions must retain confirmation.");
contains(reservations, "activeValueLabel", "Reservation value must remain currency-safe.");

console.log("Enterprise shell, permission-aware dashboard composition, coherent design density, typography, responsive records, portfolio, finance, maintenance, and front-desk visual contracts verified.");
