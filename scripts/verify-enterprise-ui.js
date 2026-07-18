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

for (const filename of ["legacy/index.css", "part-12.css", "part-13.css", "foundation.css", "portfolio.css", "finance.css"]) {
  contains(globals, `@import "./styles/${filename}";`, `Global CSS must load ${filename}.`);
}
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
contains(shell, "sidebar-context", "Desktop navigation must expose the active workspace context.");
contains(shell, '{current?.[2] || "Workspace"}', "Topbar must expose the current operational area.");
contains(shell, "{user.role}", "User identity must expose role rather than an abstract permission count.");
contains(pageHeader, "page-header-copy", "Page headings require a stable copy container.");
contains(pageHeader, "className = \"\"", "Page headings must support page-level composition without duplicated markup.");
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

console.log("Enterprise shell, CSS architecture, portfolio workflows, finance workflows, responsive behavior, and visual contracts verified.");
