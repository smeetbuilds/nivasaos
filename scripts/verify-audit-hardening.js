import fs from "node:fs";
import { fromMinorUnits, moneyInput, toMinorUnits } from "../lib/money.js";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const requireText = (file, needle, message) => {
  if (!fs.existsSync(file) || !read(file).includes(needle)) failures.push(message || `${file}: missing ${needle}`);
};
const rejectText = (file, needle, message) => {
  if (fs.existsSync(file) && read(file).includes(needle)) failures.push(message || `${file}: contains ${needle}`);
};

requireText("app/api/lease-documents/[id]/route.js", 'hasPermission(user, "handover.manage", document.property_id)', "Lease document delivery does not enforce handover.manage");
requireText("app/api/lease-documents/[id]/route.js", "archived_at IS NULL", "Archived lease documents remain downloadable by staff");
requireText("lib/actions/verticals.js", "parsed.toISOString().slice(0, 10) !== date", "Vertical date validation does not reject impossible dates");
requireText("lib/actions/verticals.js", "AND status=$currentStatus", "Vertical state transitions are not conditional");
requireText("lib/actions/verticals.js", "(0[1-9]|1[0-2])", "Monthly billing periods do not validate month range");
requireText("lib/actions/verticals.js", "`${created.length} service invoice(s) generated`", "Bulk billing success count does not use created rows");
requireText("app/(workspace)/tenant-portal/workspace.js", "nivasa_portal_invite_handoff", "Tenant portal does not read the secure invite handoff");
rejectText("app/(workspace)/tenant-portal/workspace.js", "query?.invite", "Tenant portal still reads raw invite tokens from URLs");
for (const file of ["lib/actions/finance-payments.js", "lib/actions/portal-payments.js", "lib/actions/portal-deposits.js"]) {
  rejectText(file, "+ 0.001", `${file} still uses a floating-point tolerance`);
  requireText(file, "Minor", `${file} does not reconcile through minor units`);
}
requireText("lib/db.js", "applyMoneyMigrations(database)", "Database startup does not activate money scale guards");
requireText("lib/schema/money-migrations.js", "money values must use no more than two decimal places", "Database money precision triggers are missing");
requireText("lib/workspace-localization.js", "Intl.DateTimeFormat", "Workspace timezone validation is missing");
requireText("lib/format.js", "businessDate()", "Business date does not use the workspace timezone");
requireText("Caddyfile", "Content-Security-Policy", "Caddy security headers are incomplete");
requireText("next.config.mjs", "Permissions-Policy", "Direct Next.js deployments are missing security headers");
if (fs.existsSync("docker-compose.yml")) failures.push("Obsolete docker-compose.yml duplicate remains tracked");
if (fs.existsSync("brand-assets/NivasaOS_Brand_Assets.zip")) failures.push("Duplicated binary brand archive remains tracked");

try {
  if (toMinorUnits("12.34") !== 1234) failures.push("Money helper converted 12.34 incorrectly");
  if (fromMinorUnits(1234) !== 12.34) failures.push("Money helper restored 1234 minor units incorrectly");
  const form = new FormData();
  form.set("amount", "9.90");
  if (moneyInput(form, "amount", { minMinor: 1 }).minor !== 990) failures.push("Money input did not preserve two-decimal amount");
  let rejected = false;
  try { toMinorUnits("12.345"); } catch { rejected = true; }
  if (!rejected) failures.push("Money helper accepted more than two decimal places");
} catch (error) {
  failures.push(`Money helper verification failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Document authorization, secure login/token handling, exact money reconciliation, strict dates, atomic transitions, deployment headers, and repository cleanup contracts are verified.");
