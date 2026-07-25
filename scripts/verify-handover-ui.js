import fs from "node:fs";

const read = (filename) => fs.readFileSync(filename, "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contains = (source, value, message) => assert(source.includes(value), message);
const excludes = (source, value, message) => assert(!source.includes(value), message);
const tableLabels = (source, name) => {
  const marker = `data-mobile-cards="${name}"`;
  const markerIndex = source.indexOf(marker);
  assert(markerIndex >= 0, `${name} must opt into the shared mobile record-card contract.`);
  const start = source.lastIndexOf("<table", markerIndex);
  const end = source.indexOf("</table>", markerIndex);
  assert(start >= 0 && end > markerIndex, `${name} table block could not be isolated.`);
  return [...source.slice(start, end + 8).matchAll(/data-label="([^"]+)"/g)].map((match) => match[1]);
};

const workspace = read("app/(workspace)/handover/workspace.js");
const fields = read("components/LeaseTenantFields.js");
const actions = read("lib/actions/handover.js");
const actionExports = read("app/actions.js");

contains(workspace, "<ConfirmAction", "Lease document archival must use the shared confirmation contract.");
contains(workspace, "archiveLeaseDocumentAction", "Lease document archival must retain its audited Server Action.");
contains(workspace, "<LeaseTenantFields", "Key attribution must use lease-scoped tenant controls.");
contains(workspace, 'import StatefulForm from "@/components/StatefulForm"', "Handover modal workflows must import the structured form contract.");
assert((workspace.match(/<StatefulForm action=/g) || []).length === 5, "All five handover modal workflows must preserve submitted state on rejection.");
for (const name of ["createInspectionAction", "addInspectionItemAction", "completeInspectionAction", "uploadLeaseDocumentAction", "recordKeyTransactionAction"]) {
  contains(actionExports, `function ${name}(previousStateOrFormData, maybeFormData)`, `${name} must be compatible with React action state.`);
  excludes(workspace, `<form action={${name}}>`, `${name} still uses a legacy modal form.`);
}
contains(workspace, "Reselect the file after a rejected submission.", "Document uploads must explain the browser file-input restoration boundary.");
excludes(workspace, "danger-text", "Handover must not use legacy destructive-action classes.");

const expectedTables = {
  "handover-inspections": ["Inspection", "Lease / home", "Date", "Checklist", "Acknowledgement", "Status", "Actions"],
  "handover-documents": ["Document", "Lease / home", "Visibility", "Uploaded", "File", "Actions"],
  "handover-keys": ["Reference", "Lease / tenant", "Key", "Action", "Date", "Recorded by"]
};
for (const [name, expected] of Object.entries(expectedTables)) {
  const labels = tableLabels(workspace, name);
  assert(JSON.stringify(labels) === JSON.stringify(expected), `${name} mobile labels must exactly equal ${expected.join(", ")}; found ${labels.join(", ") || "none"}.`);
}

contains(fields, '"use client"', "Dependent lease and tenant controls must be client-interactive.");
contains(fields, "String(tenant.lease_id) === leaseId", "Tenant choices must be filtered by the selected lease.");
contains(fields, 'setTenantId("")', "Changing a lease must clear an incompatible tenant selection.");
contains(fields, "disabled={!leaseId || !filteredTenants.length}", "Tenant attribution must remain disabled until a compatible lease is selected.");
contains(fields, "const helpId = useId()", "Dependent controls must generate a collision-safe help identifier.");
contains(fields, "aria-describedby={helpId}", "Dependent tenant selection must expose contextual help.");
contains(actions, "Tenant is not linked to this lease", "Server-side lease and tenant relationship validation must remain enforced.");

console.log("Handover archive confirmation, lease-scoped tenant attribution, structured modal recovery, file-input guidance, and exact mobile record-card contracts verified.");
