import fs from "node:fs";
import { ActionValidationError, runStructuredAction } from "../lib/action-state.js";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const required = [
  "lib/action-state.js",
  "components/StatefulForm.js",
  "components/ModalForm.js",
  "app/styles/forms.css",
  "app/actions.js",
  "app/(workspace)/properties/page.js",
  "app/(workspace)/tenants/page.js",
  "app/(workspace)/leases/page.js",
  "app/(workspace)/invoices/InvoiceForms.js",
  "app/(workspace)/payments/page.js",
  "app/(workspace)/maintenance/page.js",
  "app/(workspace)/handover/workspace.js",
  "app/(workspace)/team/page.js",
  "app/(workspace)/billing/page.js",
  "components/ModuleGovernanceForm.js"
];
for (const file of required) if (!fs.existsSync(file)) failures.push(`${file}: missing`);

if (!failures.length) {
  const actions = read("app/actions.js");
  const stateful = read("components/StatefulForm.js");
  const modal = read("components/ModalForm.js");
  const globals = read("app/globals.css");
  const packageJson = JSON.parse(read("package.json"));
  const pages = required.filter((file) => file.startsWith("app/(workspace)") || file === "components/ModuleGovernanceForm.js").map(read).join("\n");

  for (const name of [
    "createPropertyAction", "updatePropertyAction", "createTenantAction", "updateTenantAction", "createLeaseAction",
    "createInvoiceAction", "createRentRunAction", "recordPaymentAction", "createLateFeeRunAction",
    "createMaintenanceAction", "addStaffMaintenanceCommentAction", "createInspectionAction", "addInspectionItemAction",
    "completeInspectionAction", "uploadLeaseDocumentAction", "recordKeyTransactionAction",
    "createTeamMemberAction", "updateTeamMemberAction", "updateUserPermissionsAction",
    "updateBillingPolicyAction", "updateWorkspaceModulesAction"
  ]) {
    if (!actions.includes(`function ${name}(previousStateOrFormData, maybeFormData)`)) failures.push(`app/actions.js: ${name} is not state-compatible`);
  }
  for (const needle of ["runStructuredAction", "NEXT_REDIRECT", "SENSITIVE_FIELD", "fieldErrors", "serializedValues"]) {
    if (!read("lib/action-state.js").includes(needle)) failures.push(`lib/action-state.js: missing ${needle}`);
  }
  for (const needle of ["useActionState", "data-stateful-form", "aria-invalid", "data-action-field-error", "showModal", "requestAnimationFrame", "ActionStateMessage"]) {
    if (!stateful.includes(needle)) failures.push(`components/StatefulForm.js: missing ${needle}`);
  }
  if (!modal.includes("<ActionStateMessage/>")) failures.push("components/ModalForm.js: action-state summary is not rendered inside dialogs");
  if (!globals.includes('@import "./styles/forms.css";')) failures.push("app/globals.css: structured form styles are not imported");
  const teamPage = read("app/(workspace)/team/page.js");
  const billingPage = read("app/(workspace)/billing/page.js");
  const moduleForm = read("components/ModuleGovernanceForm.js");
  if ((teamPage.match(/<StatefulForm action=/g) || []).length !== 4) failures.push("Team administration must use four structured modal form contracts");
  for (const name of ["createTeamMemberAction", "updateTeamMemberAction", "updateUserPermissionsAction"]) {
    if (teamPage.includes(`<form action={${name}}>`)) failures.push(`Team administration still uses a legacy ${name} form`);
  }
  if ((billingPage.match(/<StatefulForm action=/g) || []).length !== 2) failures.push("Billing administration must use structured policy and fee-run forms");
  for (const name of ["updateBillingPolicyAction", "createLateFeeRunAction"]) {
    if (billingPage.includes(`<form action={${name}}>`)) failures.push(`Billing administration still uses a legacy ${name} form`);
  }
  if (!moduleForm.includes("<StatefulForm action={action}") || !moduleForm.includes("<ActionStateMessage/>")) failures.push("Module governance does not preserve and announce rejected submissions");
  if ((pages.match(/<StatefulForm action=/g) || []).length < 23) failures.push("workspace forms: expected high-use, handover, Team, billing, and module-governance workflows to use StatefulForm");
  if (packageJson.scripts?.["verify:action-state"] !== "bun run scripts/verify-action-state.js") failures.push("package.json: verify:action-state is not wired");
  if (!String(packageJson.scripts?.verify || "").includes("verify:action-state")) failures.push("package.json: repository verification omits action-state checks");
}

const data = new FormData();
data.set("email", "resident@example.test");
data.set("password", "must-not-be-returned");
data.set("amount", "invalid");
const result = await runStructuredAction(async () => {
  throw new ActionValidationError("amount must be a number", { amount: "Enter a valid amount" });
}, { attempt: 4 }, data);
if (result.status !== "error" || result.attempt !== 5) failures.push("runStructuredAction: structured failure state is incorrect");
if (result.fieldErrors?.amount !== "Enter a valid amount") failures.push("runStructuredAction: field errors are not preserved");
if (result.values?.email !== "resident@example.test" || Object.hasOwn(result.values || {}, "password")) failures.push("runStructuredAction: safe values were not preserved or sensitive values leaked");
let legacyThrew = false;
try { await runStructuredAction(async () => { throw new Error("legacy failure"); }, data); } catch { legacyThrew = true; }
if (!legacyThrew) failures.push("runStructuredAction: legacy direct forms no longer retain exception behavior");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Structured server-action errors, safe value preservation, modal retention, field annotation, legacy compatibility, and high-use, handover, Team, billing, and module-governance adoption are verified.");
