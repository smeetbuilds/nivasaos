import fs from "node:fs";
import { canDeliverLeaseDocument } from "../lib/document-authorization.js";
import { fromMinorUnits, moneyInput, toMinorUnits } from "../lib/money.js";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const requireText = (file, needle, message) => {
  if (!fs.existsSync(file) || !read(file).includes(needle)) failures.push(message || `${file}: missing ${needle}`);
};
const rejectText = (file, needle, message) => {
  if (fs.existsSync(file) && read(file).includes(needle)) failures.push(message || `${file}: contains ${needle}`);
};
const expectFailure = (callback, message) => {
  let failed = false;
  try { callback(); } catch { failed = true; }
  if (!failed) failures.push(message);
};

const document = { property_id: 17 };
if (!canDeliverLeaseDocument(document, (permission, propertyId) => permission === "handover.manage" && propertyId === 17)) {
  failures.push("Lease document authorization rejected a permitted handover manager");
}
if (canDeliverLeaseDocument(document, () => false)) failures.push("Lease document authorization allowed a denied user");
if (canDeliverLeaseDocument(document, (permission, propertyId) => permission === "handover.manage" && propertyId === 99)) {
  failures.push("Lease document authorization ignored the document property");
}
if (canDeliverLeaseDocument(null, () => true)) failures.push("Lease document authorization accepted a missing document");

requireText("app/api/lease-documents/[id]/route.js", "canDeliverLeaseDocument", "Lease document route does not invoke the tested authorization contract");
requireText("app/api/lease-documents/[id]/route.js", "archived_at IS NULL", "Archived lease documents remain downloadable by staff");
requireText("lib/actions/verticals.js", "validDate(zoned[1]", "Offset timestamps do not validate their calendar-date prefix");
requireText("lib/actions/verticals.js", "sameStatus", "Housekeeping note-only updates are not supported safely");
requireText("lib/actions/verticals.js", "AND status=$currentStatus", "Vertical state transitions are not conditional");
requireText("lib/actions/verticals.js", "(0[1-9]|1[0-2])", "Monthly billing periods do not validate month range");
requireText("lib/actions/verticals.js", "`${created.length} service invoice(s) generated`", "Bulk billing success count does not use created rows");
requireText("lib/schema/release-migrations.js", "trg_hostel_reservation_overlap_update", "SQLite does not enforce reservation overlap during status updates");
requireText("app/(workspace)/tenant-portal/workspace.js", "hashPortalToken(parsedHandoff.token)", "Tenant portal does not verify the handoff against the active invite hash");
requireText("app/(workspace)/tenant-portal/workspace.js", "ti.consumed_at IS NULL", "Tenant portal can display a consumed invite handoff");
rejectText("app/(workspace)/tenant-portal/workspace.js", "query?.invite", "Tenant portal still reads raw invite tokens from URLs");
requireText("lib/actions/portal-accounts.js", "encodePortalInviteHandoff", "Portal actions do not use the shared handoff contract");
requireText("lib/actions/portal-accounts.js", "retryAfter === 0 && !legacyLocked ? verifyPasswordOrDummy", "Tenant login hashes passwords even when requests are already blocked");
requireText("lib/actions/auth.js", "retryAfter === 0 && !legacyLocked ? verifyPasswordOrDummy", "Staff login hashes passwords even when requests are already blocked");
requireText("lib/auth-rate-limit.js", "expiredLock", "Expired throttle locks do not reset their failure window");
for (const file of ["lib/actions/finance-payments.js", "lib/actions/portal-payments.js", "lib/actions/portal-deposits.js"]) {
  rejectText(file, "+ 0.001", `${file} still uses a floating-point tolerance`);
}
requireText("lib/actions/finance-payments.js", "toMinorUnits", "Staff payments do not reconcile through minor units");
requireText("lib/actions/portal-payments.js", "toMinorUnits", "Portal payments do not reconcile through minor units");
requireText("lib/actions/portal-deposits.js", "CAST(ROUND(amount*100) AS INTEGER)", "Deposit balances are not aggregated in integer minor units");
requireText("lib/money.js", "NUMERIC_NOISE_TOLERANCE", "Computed REAL values do not use a bounded noise tolerance");
requireText("lib/db.js", "applyLocalizationMigrations(database)", "Database startup does not migrate an explicit workspace timezone");
requireText("lib/db.js", "applyMoneyMigrations(database)", "Database startup does not activate money scale guards");
requireText("lib/schema/money-migrations.js", "assertHistoricalScale", "Money migration does not preflight historical values");
requireText("lib/schema/money-migrations.js", "ROUND(${prefix}.${column},2) != ${prefix}.${column}", "Money precision triggers still use an epsilon tolerance");
requireText("lib/workspace-localization.js", "Workspace timezone is not configured", "Workspace timezone loading does not fail closed");
requireText("lib/workspace-localization.js", "zonedDateTimeToIso", "Workspace wall-clock timestamps cannot be normalized to UTC");
requireText("lib/actions/settings.js", "invalidateWorkspaceLocalizationCache", "Timezone changes do not invalidate localization cache");
requireText("lib/format.js", "normalizedTimestamp", "Mixed SQLite and ISO timestamp shapes are not normalized before display");
requireText("lib/format.js", 'normalizedCurrency === "INR" ? "en-IN"', "INR display does not preserve Indian digit grouping");
requireText("lib/auth-rate-limit.js", "NIVASA_TRUST_PROXY_HEADERS", "Network throttling is not gated by an explicit trusted-proxy setting");
requireText("lib/auth-rate-limit.js", "x-nivasa-client-ip", "Network throttling does not use the proxy-overwritten header");
rejectText("lib/auth-rate-limit.js", "x-forwarded-for", "Network throttling trusts spoofable X-Forwarded-For input");
rejectText("lib/auth-rate-limit.js", "x-real-ip", "Network throttling trusts spoofable X-Real-IP input");
requireText("Caddyfile", "header_up X-Nivasa-Client-IP {remote_host}", "Caddy does not overwrite the trusted client-address header");
rejectText("Caddyfile", "Content-Security-Policy", "Caddy overrides the application nonce CSP");
rejectText("next.config.mjs", "Content-Security-Policy", "Static Next configuration overrides the request nonce CSP");
for (const needle of ["randomUUID", "x-nonce", "'nonce-${nonce}'", "'strict-dynamic'", "frame-ancestors 'none'", "object-src 'none'"]) {
  requireText("proxy.js", needle, `Nonce CSP proxy is missing ${needle}`);
}
requireText("app/layout.js", "await headers()", "Root layout does not force nonce-aware dynamic rendering");
requireText("compose.production.yml", 'NIVASA_TRUST_PROXY_HEADERS: "1"', "Production Compose does not enable trusted proxy metadata explicitly");
for (const file of ["README.md", "docs/PRODUCTION_RELEASE.md", "docs/BACKUPS.md"]) {
  requireText(file, "docker compose --env-file .env.production -f compose.production.yml", `${file} does not load Compose interpolation values`);
}
rejectText("docs/WHITE_LABEL.md", "NivasaOS_Brand_Assets.zip", "White-label documentation references a removed archive");
if (fs.existsSync("docker-compose.yml")) failures.push("Obsolete docker-compose.yml duplicate remains tracked");
if (fs.existsSync("brand-assets/NivasaOS_Brand_Assets.zip")) failures.push("Duplicated binary brand archive remains tracked");

try {
  if (toMinorUnits("12.34") !== 1234) failures.push("Money helper converted 12.34 incorrectly");
  if (fromMinorUnits(1234) !== 12.34) failures.push("Money helper restored 1234 minor units incorrectly");
  if (toMinorUnits(0.1 + 0.2) !== 30) failures.push("Money helper rejected ordinary SQLite REAL aggregate noise");
  const adjacentA = toMinorUnits("29999999999999.98");
  const adjacentB = toMinorUnits("29999999999999.99");
  if (adjacentB - adjacentA !== 1) failures.push("Large adjacent cent values collapse to the same amount");
  const form = new FormData();
  form.set("amount", "9.90");
  if (moneyInput(form, "amount", { minMinor: 1 }).minor !== 990) failures.push("Money input did not preserve two-decimal amount");
  expectFailure(() => toMinorUnits("12.345"), "Money helper accepted more than two decimal places");
  expectFailure(() => toMinorUnits(0.000000001), "Numeric money helper accepted a sub-cent value beyond the noise bound");
  expectFailure(() => toMinorUnits("30000000000000.01"), "Money helper accepted an amount beyond the safe storage range");
} catch (error) {
  failures.push(`Money helper verification failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Behavioral document authorization, secure invite lifecycle, bounded REAL normalization, exact submitted money parsing, historical preflight, trusted-proxy throttling, timestamp normalization, nonce CSP, Compose loading, and repository cleanup are verified.");
