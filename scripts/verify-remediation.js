import fs from "node:fs";
import { canDeliverFinancialProof } from "../lib/financial-proof-authorization.js";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const requireText = (file, needle, message) => {
  if (!fs.existsSync(file) || !read(file).includes(needle)) failures.push(message || `${file}: missing ${needle}`);
};
const rejectText = (file, needle, message) => {
  if (fs.existsSync(file) && read(file).includes(needle)) failures.push(message || `${file}: contains ${needle}`);
};

const proof = { property_id: 21, proof_path: "payment-proof.png" };
if (!canDeliverFinancialProof(proof, "payments.manage", (permission, propertyId) => permission === "payments.manage" && propertyId === 21)) failures.push("Permitted payment manager cannot retrieve a payment proof");
if (canDeliverFinancialProof(proof, "payments.manage", () => false)) failures.push("Denied user can retrieve a payment proof");
if (canDeliverFinancialProof(proof, "portfolio.view", () => true)) failures.push("Non-financial permission can retrieve a financial proof");
if (canDeliverFinancialProof({ property_id: 21 }, "payments.manage", () => true)) failures.push("Record without a proof path is deliverable");
if (canDeliverFinancialProof({ property_id: 0, proof_path: "proof.png" }, "payments.manage", () => true)) failures.push("Invalid property scope is deliverable");

for (const [file, permission] of [
  ["app/api/payment-submissions/[id]/proof/route.js", "payments.manage"],
  ["app/api/proofs/[id]/route.js", "payments.manage"],
  ["app/api/deposit-proofs/[id]/route.js", "deposits.manage"]
]) {
  requireText(file, "canDeliverFinancialProof", `${file} bypasses the shared financial-proof authorization contract`);
  requireText(file, `\"${permission}\"`, `${file} does not require ${permission}`);
  requireText(file, "localFileResponse", `${file} bypasses the hardened local-file responder`);
  rejectText(file, "canAccessProperty", `${file} still authorizes by property assignment alone`);
}

const reports = "app/(workspace)/reports/workspace.js";
requireText(reports, '<progress className="progress native-progress', "Reports does not use CSP-safe native progress controls");
requireText(reports, "collectionMaxByCurrency", "Multi-currency report bars are not normalized within each currency");
rejectText(reports, "style={{ width:", "Reports still uses CSP-blocked inline width styles");

const compose = read("compose.yml");
if (!compose.includes('"127.0.0.1:${NIVASA_PORT:-3000}:3000"')) failures.push("Local Compose does not bind the application port to loopback");
if (compose.includes('      - "${NIVASA_PORT:-3000}:3000"')) failures.push("Local Compose still publishes the application on every interface");

for (const file of ["lib/data.js", "lib/billing.js"]) {
  requireText(file, "$businessToday", `${file} does not bind the configured workspace business date into SQL`);
  rejectText(file, "date('now')", `${file} still classifies business records using UTC date('now')`);
  rejectText(file, "strftime('%Y-%m','now')", `${file} still classifies the billing period using UTC now`);
}

const portalPage = "app/(workspace)/tenant-portal/page.js";
const portalWorkspace = "app/(workspace)/tenant-portal/workspace.js";
const portalAccess = "app/(workspace)/tenant-portal/PortalAccessSection.js";
const portalPayments = "app/(workspace)/tenant-portal/PortalPaymentSection.js";
const portalDeposits = "app/(workspace)/tenant-portal/PortalDepositSection.js";
const shell = "components/AppShell.js";
requireText(portalPage, 'anyOf: ["portal.manage", "payments.manage", "deposits.manage"]', "Tenant portal route still requires every portal-related permission");
rejectText(portalPage, 'allOf: ["portal.manage", "payments.manage", "deposits.manage"]', "Tenant portal route still blocks independent delegation");
for (const permission of ["portal.manage", "payments.manage", "deposits.manage"]) {
  requireText(portalWorkspace, `permissionScopeSql(user, \"${permission}\", \"p\")`, `Tenant portal does not independently scope ${permission}`);
}
requireText(portalWorkspace, "<PortalAccessSection", "Tenant portal does not render the extracted access section");
requireText(portalWorkspace, "<PortalPaymentSection", "Tenant portal does not render the extracted payment section");
requireText(portalWorkspace, "<PortalDepositSection", "Tenant portal does not render the extracted deposit section");
requireText(portalAccess, "{canManageAccess && <section", "Portal account controls are not conditionally rendered by portal.manage");
requireText(portalPayments, "if (!canReviewPayments) return null", "Payment review is not conditionally rendered by payments.manage");
requireText(portalDeposits, "if (!canManageDeposits) return null", "Deposit management is not conditionally rendered by deposits.manage");
requireText(shell, 'portal.manage|payments.manage|deposits.manage', "Navigation still requires every tenant-portal permission");
rejectText(shell, 'portal.manage&payments.manage&deposits.manage', "Navigation still uses the all-permission portal contract");
rejectText(shell, "<style jsx global>", "AppShell still injects runtime styles under the strict CSP");

const serviceActions = "lib/actions/services.js";
requireText(serviceActions, "moneyInput", "Service actions do not use the shared strict money-input parser");
for (const stale of [
  'Math.max(0, number(formData, "amount"',
  'Math.max(0, number(formData, "customAmount"'
]) {
  rejectText(serviceActions, stale, `Service money input still silently coerces invalid values: ${stale}`);
}
requireText(serviceActions, "normalizedMoney(subscription.custom_amount ?? subscription.service_amount", "Individual service billing does not normalize stored money before invoicing");
requireText(serviceActions, "customAmountMinor", "Service assignment audit does not retain normalized custom-amount evidence");

requireText("app/globals.css", '@import "./styles/readability.css";', "Readability overrides are not loaded last");
for (const needle of [".table-wrap td", "font-size: 13px", "overscroll-behavior-inline", "@media (max-width: 720px)"]) {
  requireText("app/styles/readability.css", needle, `Readability contract is missing ${needle}`);
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Financial proof permissions, CSP-safe reports, loopback-only local Compose, workspace-date SQL, independently delegated tenant-portal sections, strict secondary money inputs, and operational readability are verified.");
