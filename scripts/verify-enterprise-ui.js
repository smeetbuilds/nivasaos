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
const governanceCss = read("app/styles/governance.css");
const polish = read("app/styles/polish.css");
const shell = read("components/AppShell.js");
const pageHeader = read("components/PageHeader.js");
const moduleGovernanceForm = read("components/ModuleGovernanceForm.js");
const operationsBoard = read("components/OperationsBoard.js");
const dashboard = read("app/(workspace)/dashboard/page.js");
const properties = read("app/(workspace)/properties/page.js");
const modulesPage = read("app/(workspace)/modules/page.js");
const team = read("app/(workspace)/team/page.js");
const people = read("app/(workspace)/tenants/page.js");
const agreements = read("app/(workspace)/leases/page.js");
const invoices = read("app/(workspace)/invoices/page.js");
const invoiceTable = read("app/(workspace)/invoices/InvoiceTable.js");
const payments = read("app/(workspace)/payments/page.js");
const billing = read("app/(workspace)/billing/page.js");
const reports = read("app/(workspace)/reports/workspace.js");
const maintenance = read("app/(workspace)/maintenance/page.js");
const reservations = read("app/(workspace)/reservations/page.js");
const housekeeping = read("app/(workspace)/housekeeping/page.js");

for (const filename of ["legacy/index.css", "part-12.css", "part-13.css", "foundation.css", "portfolio.css", "finance.css", "operations.css", "dashboard.css", "governance.css", "polish.css"]) {
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

for (const contract of [
  ".property-directory-results",
  ".module-governance-summary",
  ".module-governance-card.is-enabled",
  ".module-primary-panel",
  ".team-summary-grid",
  ".team-directory-table",
  "dialog[id^=\"permissions-\"]",
  "@media (max-width: 720px)"
]) contains(governanceCss, contract, `Governance polish contract missing: ${contract}`);
excludes(governanceCss, "font-size: 8px", "Governance polish must not use unreadably small text.");
contains(moduleGovernanceForm, '"use client"', "Module architecture must update selections without a full page round-trip.");
contains(moduleGovernanceForm, "Keep at least one operating module enabled", "Module architecture must guard the final enabled model.");
contains(moduleGovernanceForm, "selectedModules.map", "Primary-model options must track enabled selections live.");
contains(moduleGovernanceForm, "module.propertyCount", "Modules used by properties must expose their locked state.");
contains(moduleGovernanceForm, "Unsaved changes", "Module architecture needs visible save-state feedback.");
contains(modulesPage, "ModuleGovernanceForm", "The modules page must use the live governance form.");
contains(properties, 'aria-label="Property directory results"', "Property cards need an accessible results region.");
contains(properties, "property-cover-model", "Property cards must expose their operating model at a glance.");
contains(properties, 'className="button secondary small"', "Property-card actions need a visible consistent control.");
contains(team, 'aria-label="Team access summary"', "Team governance needs decision-oriented summary metrics.");
contains(team, 'data-mobile-cards="team"', "Team accounts must use shared mobile record cards.");
contains(team, 'data-label="Effective permissions"', "Team mobile cards need explicit capability labels.");
contains(team, "permissionDescriptions", "Permission matrices need human-readable capability descriptions.");
contains(team, 'maxLength="256"', "Temporary-password UI must match bounded server parsing.");

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

for (const contract of [
  ".finance-toolbar",
  ".finance-command-grid",
  ".finance-policy-grid",
  ".finance-empty-state",
  ".report-collection-period",
  ".report-arrears-panel",
  "@media (max-width: 480px)"
]) contains(finance, contract, `Finance and reporting polish contract missing: ${contract}`);
excludes(finance, "font-size: 8px", "Finance interfaces must not use unreadably small text.");
excludes(finance, "nth-child(10)::before", "Invoice mobile labels must not depend on fragile column positions.");
contains(invoices, 'aria-label="Receivables summary"', "Invoices require a receivables summary.");
contains(invoices, 'workspace.overdueCount ? " risk"', "Invoice risk styling must be driven by actual overdue records.");
contains(invoiceTable, 'aria-label="Filter invoices"', "Invoices require accessible filters.");
contains(invoiceTable, 'data-mobile-cards="invoices"', "Invoices must use the shared mobile record-card contract.");
contains(invoiceTable, 'data-label="Actions"', "Invoice actions need explicit mobile labels.");
contains(invoiceTable, "Apply filters", "Invoice filtering needs an explicit action label.");
contains(payments, 'aria-label="Payment collection summary"', "Payments require a currency-safe collection summary.");
contains(payments, 'aria-label="Filter payments"', "Payments require URL-shareable filters.");
contains(payments, "unallocatedCount", "Payment summaries must expose allocation risk.");
contains(payments, "missingProofCount", "Payment summaries must expose evidence gaps.");
contains(payments, 'properties.length > 0 ? <OpenModalButton', "Payment creation must not open without a permitted property.");
contains(payments, 'data-mobile-cards="payments"', "Payments must retain mobile record cards.");
contains(billing, 'aria-label="Billing policy summary"', "Billing policies require an operational summary.");
contains(billing, 'aria-label="Filter billing policies"', "Billing policies require URL-shareable filters.");
contains(billing, 'data-mobile-cards="late-fees"', "Late-fee previews must be mobile record cards.");
contains(billing, 'aria-labelledby="late-fee-preview-title"', "Late-fee preview needs a stable accessible heading.");
contains(billing, 'summary.count ? " risk"', "Billing risk styling must reflect actual eligibility.");
contains(reports, 'aria-label="Reporting summary"', "Reports require an intelligence summary.");
contains(reports, 'aria-label="Filter reports by property"', "Reports require one explicit scope control.");
contains(reports, "requestedPropertyId", "Report scope must validate the requested property.");
contains(reports, "selectedProperty", "Report context must identify the selected property.");
contains(reports, "report-collection-period", "Collection rows need property context in portfolio view.");
contains(reports, 'aria-label="Portfolio report insights"', "Report insights need an accessible region label.");

for (const contract of [
  ".operations-board-nav",
  ".operations-board-tab.is-active",
  ".operations-board-viewport",
  ".enterprise-kanban",
  ".enterprise-reservation-board",
  ".enterprise-housekeeping-board",
  ".housekeeping-context-grid",
  ".operations-history-note",
  "@media (max-width: 480px)",
  "@media (prefers-reduced-motion: reduce)"
]) contains(operationsCss, contract, `Operations-board contract missing: ${contract}`);
excludes(operationsCss, "font-size: 8px", "Operational boards must not use unreadably small text.");
contains(operationsBoard, '"use client"', "Operations boards need client-side column navigation.");
contains(operationsBoard, "ResizeObserver", "Operations boards must react to responsive overflow changes.");
contains(operationsBoard, "data-board-column", "Operations boards need stable column navigation targets.");
contains(operationsBoard, "prefersReducedMotion", "Board scrolling must respect reduced-motion preferences.");
contains(operationsBoard, "View previous board columns", "Board overflow controls need accessible labels.");
contains(maintenance, 'aria-label="Maintenance workload summary"', "Maintenance requires workload metrics.");
contains(maintenance, 'aria-label="Filter maintenance tickets"', "Maintenance requires URL-shareable filters.");
contains(maintenance, "<OperationsBoard", "Maintenance must use navigable workflow columns.");
contains(maintenance, "Return to reported", "Maintenance backward transitions need explicit language.");
contains(maintenance, "Reopen work", "Resolved maintenance must expose an explicit reopen action.");
contains(maintenance, "Apply filters", "Maintenance filtering needs a clear action label.");
contains(reservations, 'aria-label="Reservation operations summary"', "Reservations require front-desk metrics.");
contains(reservations, 'aria-label="Filter reservations"', "Reservations require URL-shareable filters.");
contains(reservations, "<OperationsBoard", "Reservations must use navigable status columns.");
contains(reservations, "<TransitionConfirmation", "Reservation destructive transitions must retain confirmation.");
contains(reservations, "activeValueLabel", "Reservation value must remain currency-safe.");
contains(reservations, "Historical reservation record", "Closed reservation cards need an explicit historical state.");
contains(housekeeping, 'aria-label="Housekeeping workload summary"', "Housekeeping needs operational workload metrics.");
contains(housekeeping, 'aria-label="Filter housekeeping tasks"', "Housekeeping needs URL-shareable filters.");
contains(housekeeping, '["cancelled", "Cancelled"]', "Cancelled housekeeping tasks must remain visible in history.");
contains(housekeeping, "manageableProperties", "Housekeeping creation must respect property-level management scope.");
contains(housekeeping, "<OperationsBoard", "Housekeeping must use navigable status columns.");

console.log("Enterprise shell, permission-aware dashboard composition, live module governance, coherent property and team access surfaces, responsive records, actionable finance and reporting intelligence, and fully navigable maintenance, reservation, and housekeeping workflow contracts verified.");
