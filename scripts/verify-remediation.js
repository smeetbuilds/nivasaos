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

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Financial proof permissions, CSP-safe reports, loopback-only local Compose, currency-safe chart scaling, and workspace-date SQL are verified.");
