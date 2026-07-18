import fs from "node:fs";

const read = (filename) => fs.readFileSync(filename, "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contains = (source, value, message) => assert(source.includes(value), message);
const excludes = (source, value, message) => assert(!source.includes(value), message);

const globals = read("app/globals.css");
const contract = read("app/styles/part-14.css");
const portfolioContract = read("app/styles/part-15.css");
const shell = read("components/AppShell.js");
const pageHeader = read("components/PageHeader.js");
const dashboard = read("app/(workspace)/dashboard/page.js");
const properties = read("app/(workspace)/properties/page.js");
const people = read("app/(workspace)/tenants/page.js");
const agreements = read("app/(workspace)/leases/page.js");

contains(globals, '@import "./styles/part-14.css";', "Enterprise design contract must load after all legacy styles.");
contains(globals, '@import "./styles/part-15.css";', "Portfolio operating-view contract must load after the enterprise foundation.");
for (const token of ["--ink: #101828", "--line: #e4e7ec", "--accent: #465fff", "--radius: 12px"]) {
  contains(contract, token, `Enterprise design token missing: ${token}`);
}
contains(contract, ".app-shell { grid-template-columns: 276px", "Desktop information architecture width is missing.");
contains(contract, ".sidebar-context", "Workspace context styling is missing.");
contains(contract, ".table-wrap tbody tr:hover", "Enterprise table interaction state is missing.");
contains(contract, "@media (max-width: 960px)", "Tablet and mobile shell breakpoint is missing.");
contains(contract, "@media (prefers-reduced-motion: reduce)", "Reduced-motion accessibility handling is missing.");
excludes(contract, ".button.primary {\n  background: linear-gradient", "Primary actions must not use decorative gradients.");
contains(shell, "sidebar-context", "Desktop navigation must expose the active workspace context.");
contains(shell, '{current?.[2] || "Workspace"}', "Topbar must expose the current operational area.");
contains(shell, "{user.role}", "User identity must expose role rather than an abstract permission count.");
contains(pageHeader, "page-header-copy", "Page headings require a stable copy container.");
contains(pageHeader, 'className = ""', "Page headings must support page-level composition without duplicated markup.");
contains(dashboard, 'title="Portfolio overview"', "Dashboard must use a task-oriented enterprise title.");
contains(dashboard, "Operating model health", "Dashboard module section must use operational language.");

for (const [name, source] of [["properties", properties], ["people", people], ["agreements", agreements]]) {
  contains(source, "portfolio-summary-grid", `${name} must expose an operational summary.`);
  contains(source, "portfolio-toolbar", `${name} must expose directory filtering.`);
  contains(source, 'method="get"', `${name} filters must remain shareable through URL parameters.`);
  contains(source, "filtered", `${name} must distinguish filtered results from the full directory.`);
}
contains(properties, "enterprise-property-grid", "Property cards must use the enterprise portfolio layout.");
contains(properties, "property-card-facts", "Property cards must expose inventory, occupancy, and contracted value together.");
contains(people, "people-filter-grid", "People directory must support property, status, and portal filtering.");
contains(people, "Currently housed", "People summary must expose current occupancy linkage.");
contains(agreements, "agreement-filter-grid", "Agreement register must support property, status, and module filtering.");
contains(agreements, "Ending within 45 days", "Agreement summary must expose renewal and move-out pressure.");
contains(agreements, "[...properties, ...leases]", "Historical agreement modules must remain available to filtering.");
contains(portfolioContract, ".portfolio-filter-grid", "Portfolio filter layout is missing.");
contains(portfolioContract, ".property-card-facts", "Property fact hierarchy is missing.");
contains(portfolioContract, "@media (max-width: 720px)", "Portfolio views require a mobile layout contract.");
contains(portfolioContract, "prefers-reduced-motion", "Portfolio views must respect reduced-motion preferences.");

console.log("Enterprise shell, dashboard, portfolio summaries, filters, record hierarchy, responsive behavior, and visual contracts verified.");
