import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const failures = [];
const requireText = (file, text, message) => {
  if (!read(file).includes(text)) failures.push(message || `${file}: missing ${text}`);
};

for (const permission of ["properties.manage", "inventory.manage", "deposits.manage", "portal.manage"]) {
  requireText("lib/verticals.js", `"${permission}"`, `Permission catalogue is missing ${permission}`);
}
for (const helper of ["propertyIdsForRequirements", "permissionRequirementsScopeSql", "assertGlobalPermission", "assertPortfolioRequirements"]) {
  requireText("lib/permission-core.js", helper, `Permission core is missing ${helper}`);
}
requireText("lib/auth.js", "currentPermissionScope", "Property reads are not connected to request-local permission scope");
requireText("lib/auth.js", "permissionRequirementsScopeSql", "Property reads do not use permission requirements");
requireText("components/AppShell.js", 'alternative.split("&")', "Navigation does not support all-of permission requirements");

const actionContracts = {
  createPropertyAction: "properties.manage",
  createUnitAction: "inventory.manage",
  createTenantInviteAction: "portal.manage",
  reviewPaymentSubmissionAction: "payments.manage",
  recordDepositTransactionAction: "deposits.manage",
  createInspectionAction: "handover.manage",
  createSpaceAction: "inventory.manage",
  createServiceAction: "services.manage",
  billServiceSubscriptionAction: "billing.manage",
  createVisitorEntryAction: "visitors.manage",
  saveCommercialProfileAction: "verticals.manage",
  bulkServiceBillingAction: "billing.manage"
};
const actions = read("app/actions.js");
for (const [action, permission] of Object.entries(actionContracts)) {
  const start = actions.indexOf(`function ${action}`);
  const end = actions.indexOf("\nexport async function", start + 1);
  const block = actions.slice(start, end === -1 ? undefined : end);
  if (start === -1 || !block.includes(permission)) failures.push(`${action} is not protected by ${permission}`);
}

const routeContracts = {
  "tenant-portal": ["portal.manage", "payments.manage", "deposits.manage"],
  handover: ["handover.manage"],
  services: ["services.manage"],
  visitors: ["visitors.manage"],
  commercial: ["verticals.manage"],
  spaces: ["inventory.manage"],
  reports: ["reports.view"],
  audit: ["audit.view"]
};
for (const [route, permissions] of Object.entries(routeContracts)) {
  const file = `app/(workspace)/${route}/page.js`;
  requireText(file, "renderPermissionScopedPage", `${route} is missing its permission-scoped page boundary`);
  for (const permission of permissions) requireText(file, permission, `${route} is missing ${permission}`);
}
requireText("app/(workspace)/audit/workspace.js", "a.property_id IS NOT NULL", "Delegated audit access includes portfolio-wide events");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Route reads, navigation, and privileged Server Actions share one explicit property-permission contract.");
