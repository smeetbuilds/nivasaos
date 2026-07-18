import fs from "node:fs";

const read = (filename) => fs.readFileSync(filename, "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contains = (source, value, message) => assert(source.includes(value), message);
const excludes = (source, value, message) => assert(!source.includes(value), message);

const workspace = read("app/(workspace)/handover/workspace.js");
const fields = read("components/LeaseTenantFields.js");
const actions = read("lib/actions/handover.js");

contains(workspace, "<ConfirmAction", "Lease document archival must use the shared confirmation contract.");
contains(workspace, "archiveLeaseDocumentAction", "Lease document archival must retain its audited Server Action.");
contains(workspace, "<LeaseTenantFields", "Key attribution must use lease-scoped tenant controls.");
excludes(workspace, "danger-text", "Handover must not use legacy destructive-action classes.");

contains(fields, '"use client"', "Dependent lease and tenant controls must be client-interactive.");
contains(fields, "String(tenant.lease_id) === leaseId", "Tenant choices must be filtered by the selected lease.");
contains(fields, 'setTenantId("")', "Changing a lease must clear an incompatible tenant selection.");
contains(fields, "disabled={!leaseId || !filteredTenants.length}", "Tenant attribution must remain disabled until a compatible lease is selected.");
contains(fields, "const helpId = useId()", "Dependent controls must generate a collision-safe help identifier.");
contains(fields, "aria-describedby={helpId}", "Dependent tenant selection must expose contextual help.");
contains(actions, "Tenant is not linked to this lease", "Server-side lease and tenant relationship validation must remain enforced.");

console.log("Handover archive confirmation and lease-scoped tenant attribution verified.");
