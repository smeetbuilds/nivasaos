import fs from "node:fs";

const required = {
  "lib/tenant-auth.js": ["nivasa_tenant_session", "hashPortalToken", "requireTenant"],
  "lib/schema.js": ["tenant_accounts", "tenant_invites", "payment_submissions", "deposit_transactions", "maintenance_comments", "actor_tenant_id"],
  "app/globals.css": ["@import \"./styles/portal.css\";", "@import \"./styles/module-operations.css\";"],
  "app/portal/(account)/page.js": ["Resident account summary", "openInvoiceCount", "Resident services summary"],
  "app/portal/(account)/billing/page.js": ["Submit payment proof", "Payment receipts", "cancel-portal-submission", "payable.length > 0"],
  "app/portal/(account)/lease/page.js": ["Deposit transactions", "depositDifference", "portal-record-action", "Acknowledging…"],
  "app/portal/(account)/requests/page.js": ["Resident request summary", "cancel-portal-request", "emptyRequestCopy"],
  "app/portal/(account)/maintenance/page.js": ["Report a maintenance issue", "addTenantMaintenanceCommentAction", "portal-history-note", "ActionButton"],
  "app/portal/(account)/profile/page.js": ["Resident profile settings", "portal-profile-save", "ActionButton"],
  "app/portal/(account)/services/page.js": ["Resident service summary", "is-historical", "portal-section-count", "latest_invoice"],
  "app/portal/(account)/visitors/page.js": ["Resident visitor summary", "ConfirmAction", "portal-visitor-cancel", "pendingLabel=\"Registering…\""],
  "app/portal/(account)/receipts/[id]/page.js": ["Payment receipt", "requireTenant"],
  "app/(workspace)/tenant-portal/page.js": ["renderPermissionScopedPage", "portal.manage", "payments.manage", "deposits.manage", "WorkspacePage"],
  "app/(workspace)/tenant-portal/workspace.js": ["PortalAccessSection", "PortalPaymentSection", "PortalDepositSection", "permissionScopeSql", "requestedTenantId", "leases.length > 0"],
  "app/(workspace)/tenant-portal/PortalAccessSection.js": ["createTenantInviteAction", "disableTenantPortalAction", "data-mobile-cards=\"portal-accounts\"", "ConfirmAction", "pendingLabel=\"Creating…\""],
  "app/(workspace)/tenant-portal/PortalPaymentSection.js": ["Tenant payment submissions", "reviewPaymentSubmissionAction", "data-mobile-cards=\"portal-submissions\"", "Approve and record"],
  "app/(workspace)/tenant-portal/PortalDepositSection.js": ["Record deposit", "recordDepositTransactionAction", "data-mobile-cards=\"portal-deposits\"", "const canRecord"],
  "components/TenantPortalShell.js": ["trapMoreFocus", "moreButtonRef", "aria-controls=\"portal-more-sheet\"", "FOCUSABLE"],
  "app/styles/portal.css": ["Resident self-service and portal administration", ".portal-admin-metrics", ".portal-metric-grid > article.is-risk", ".portal-record-action", ".portal-history-note", ".tenant-portal-bottom-nav :is(a, button)", ".tenant-portal-bottom-nav.module-bottom-nav", "@media (max-width: 600px)", "@media (prefers-reduced-motion: reduce)"],
  "app/styles/module-operations.css": [".portal-service-list > article", ".portal-visitor-list > article", ".portal-visitor-list .confirm-action", "@media (max-width: 720px)"]
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

if (fs.existsSync("app/styles/portal.css")) {
  const portalCss = fs.readFileSync("app/styles/portal.css", "utf8");
  if (portalCss.includes("font-size: 8px")) failures.push("app/styles/portal.css: resident interfaces must not use unreadably small text");
  if (portalCss.includes("overflow-x: auto")) failures.push("app/styles/portal.css: resident quick navigation and metrics must not rely on horizontal scrolling");
}
if (fs.existsSync("app/styles/module-operations.css")) {
  const moduleCss = fs.readFileSync("app/styles/module-operations.css", "utf8");
  if (moduleCss.includes("font-size: 8px")) failures.push("app/styles/module-operations.css: resident module interfaces must not use unreadably small text");
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
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Tenant portal access, focus-managed navigation, responsive administration, confirmed financial and cancellation actions, resident billing, requests, maintenance, profile, services, visitors, documents, deposits, receipts, and module-specific history contracts verified.");
