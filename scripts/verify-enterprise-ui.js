import fs from "node:fs";

const read = (filename) => fs.readFileSync(filename, "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contains = (source, value, message) => assert(source.includes(value), message);
const excludes = (source, value, message) => assert(!source.includes(value), message);

const globals = read("app/globals.css");
const contract = read("app/styles/part-14.css");
const shell = read("components/AppShell.js");
const pageHeader = read("components/PageHeader.js");
const dashboard = read("app/(workspace)/dashboard/page.js");

contains(globals, '@import "./styles/part-14.css";', "Enterprise design contract must load after all legacy styles.");
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
contains(pageHeader, "className = \"\"", "Page headings must support page-level composition without duplicated markup.");
contains(dashboard, 'title="Portfolio overview"', "Dashboard must use a task-oriented enterprise title.");
contains(dashboard, "Operating model health", "Dashboard module section must use operational language.");

console.log("Enterprise shell, hierarchy, dashboard language, responsive behavior, and visual contract verified.");
