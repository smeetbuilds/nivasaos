import fs from "node:fs";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const registers = [
  ["app/(workspace)/units/page.js", "units", 7],
  ["app/(workspace)/invoices/InvoiceTable.js", "invoices", 9],
  ["app/(workspace)/payments/page.js", "payments", 7],
  ["app/(workspace)/billing/page.js", "late-fees", 7],
  ["app/(workspace)/tenant-portal/PortalAccessSection.js", "portal-accounts", 5],
  ["app/(workspace)/tenant-portal/PortalPaymentSection.js", "portal-submissions", 6],
  ["app/(workspace)/tenant-portal/PortalDepositSection.js", "portal-deposits", 7],
  ["app/(workspace)/services/workspace.js", "service-catalogue", 7],
  ["app/(workspace)/services/workspace.js", "service-subscriptions", 7],
  ["app/(workspace)/services/workspace.js", "service-jobs", 6],
  ["app/(workspace)/visitors/workspace.js", "visitors", 7],
  ["app/(workspace)/spaces/workspace.js", "spaces", 7],
  ["app/(workspace)/commercial/workspace.js", "commercial-profiles", 8],
  ["app/(workspace)/operations/page.js", "vertical-profiles", 6],
  ["app/(workspace)/operations/page.js", "module-requests", 6],
  ["app/(workspace)/audit/workspace.js", "audit", 6],
  ["app/(workspace)/reports/workspace.js", "arrears", 7]
];
for (const file of ["app/styles/records.css", "app/globals.css", ...registers.map(([file]) => file)]) {
  if (!fs.existsSync(file)) failures.push(`${file}: missing`);
}

if (!failures.length) {
  const css = read("app/styles/records.css");
  const globals = read("app/globals.css");
  for (const needle of [
    "table[data-mobile-cards]",
    ".table-wrap:has(> table[data-mobile-cards])",
    "content: attr(data-label)",
    "display: grid !important",
    "clip-path: inset(50%)",
    "overflow-wrap: anywhere",
    "prefers-reduced-motion"
  ]) if (!css.includes(needle)) failures.push(`app/styles/records.css: missing ${needle}`);
  if (!globals.includes('@import "./styles/records.css";')) failures.push("app/globals.css: mobile record styles are not imported");

  for (const [file, name, minimumLabels] of registers) {
    const source = read(file);
    if (!source.includes(`data-mobile-cards="${name}"`)) failures.push(`${file}: ${name} table is not opted into the mobile record-card contract`);
    const labels = (source.match(/data-label=/g) || []).length;
    if (labels < minimumLabels) failures.push(`${file}: expected at least ${minimumLabels} explicit mobile field labels, found ${labels}`);
  }
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Units, invoices, payments, late-fee previews, portal administration, service catalogue, subscriptions, service jobs, visitors, spaces, commercial profiles, vertical profiles, module requests, audit history, and arrears use semantic labeled mobile record cards without removing table headers from assistive technology.");
