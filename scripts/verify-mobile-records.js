import fs from "node:fs";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const registers = [
  ["app/(workspace)/units/page.js", "units", 7],
  ["app/(workspace)/invoices/InvoiceTable.js", "invoices", 10],
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
  ["app/(workspace)/reports/workspace.js", "arrears", 7],
  ["app/(workspace)/handover/workspace.js", "handover-inspections", 7],
  ["app/(workspace)/handover/workspace.js", "handover-documents", 6],
  ["app/(workspace)/handover/workspace.js", "handover-keys", 6]
];
for (const file of ["app/styles/records.css", "app/globals.css", ...registers.map(([file]) => file)]) {
  if (!fs.existsSync(file)) failures.push(`${file}: missing`);
}

function tableBlock(source, name) {
  const marker = `data-mobile-cards="${name}"`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return "";
  const start = source.lastIndexOf("<table", markerIndex);
  const end = source.indexOf("</table>", markerIndex);
  if (start < 0 || end < markerIndex) return "";
  return source.slice(start, end + 8);
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
    const table = tableBlock(source, name);
    if (!table) {
      failures.push(`${file}: ${name} table is not opted into an isolatable mobile record-card contract`);
      continue;
    }
    const labels = (table.match(/data-label=/g) || []).length;
    if (labels < minimumLabels) failures.push(`${file}: ${name} expected at least ${minimumLabels} explicit mobile field labels, found ${labels}`);
  }
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Units, invoices, payments, late-fee previews, portal administration, services, visitors, spaces, commercial and vertical profiles, module requests, audit history, arrears, inspections, lease documents, and key records use isolated semantic mobile record cards without removing table headers from assistive technology.");
