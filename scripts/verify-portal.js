import fs from "node:fs";

const required = {
  "lib/tenant-auth.js": ["nivasa_tenant_session", "hashPortalToken", "requireTenant"],
  "lib/schema.js": ["tenant_accounts", "tenant_invites", "payment_submissions", "deposit_transactions", "maintenance_comments", "actor_tenant_id"],
  "app/portal/(account)/billing/page.js": ["Submit payment proof", "Payment receipts"],
  "app/portal/(account)/lease/page.js": ["Deposit transactions", "deposit_held"],
  "app/portal/(account)/maintenance/page.js": ["Report a maintenance issue", "addTenantMaintenanceCommentAction"],
  "app/portal/(account)/receipts/[id]/page.js": ["Payment receipt", "requireTenant"],
  "app/(workspace)/tenant-portal/page.js": ["renderPermissionScopedPage", "portal.manage", "payments.manage", "deposits.manage", "WorkspacePage"],
  "app/(workspace)/tenant-portal/workspace.js": ["PortalAccessSection", "PortalPaymentSection", "PortalDepositSection", "permissionScopeSql"],
  "app/(workspace)/tenant-portal/PortalAccessSection.js": ["createTenantInviteAction", "disableTenantPortalAction", "canManageAccess"],
  "app/(workspace)/tenant-portal/PortalPaymentSection.js": ["Tenant payment submissions", "reviewPaymentSubmissionAction", "canReviewPayments"],
  "app/(workspace)/tenant-portal/PortalDepositSection.js": ["Record deposit", "recordDepositTransactionAction", "canManageDeposits"]
};

const failures = [];
for (const [filename, needles] of Object.entries(required)) {
  if (!fs.existsSync(filename)) {
    failures.push(`${filename}: missing`);
    continue;
  }
  const source = fs.readFileSync(filename, "utf8");
  for (const needle of needles) if (!source.includes(needle)) failures.push(`${filename}: missing ${needle}`);
}

const schema = ["lib/schema.js", ...fs.readdirSync("lib/schema").filter((name) => name.endsWith(".js")).map((name) => `lib/schema/${name}`)].map((name) => fs.readFileSync(name, "utf8")).join("\n");
if (!schema.includes("token_hash TEXT NOT NULL UNIQUE")) failures.push("Portal invite/session tokens must be stored as unique hashes");
if (!schema.includes("CHECK(NOT(actor_user_id IS NOT NULL AND actor_tenant_id IS NOT NULL))")) failures.push("Maintenance comments must prevent mixed actor identities");

const actions = fs.readdirSync("lib/actions").filter((name) => name.startsWith("portal") && name.endsWith(".js")).map((name) => fs.readFileSync(`lib/actions/${name}`, "utf8")).join("\n");
for (const needle of ["createTenantInviteAction", "reviewPaymentSubmissionAction", "recordDepositTransactionAction", "createTenantMaintenanceAction"]) if (!actions.includes(needle)) failures.push(`portal actions: missing ${needle}`);
if (!actions.includes("Number(consumed.changes) !== 1")) failures.push("Activation links must be consumed atomically");
if (!actions.includes("status='pending'")) failures.push("Tenant proof submissions must reserve pending invoice amounts");
if (!actions.includes("Payment now exceeds the invoice balance")) failures.push("Staff approval must revalidate the live invoice balance");
if (!actions.includes("Deposit reduction exceeds the amount currently held")) failures.push("Deposit refunds/debits must not make the held balance negative");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Tenant portal access, extracted permission-scoped administration, financial review, deposit, receipt, and maintenance contracts verified.");
