import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const filename = process.argv[2];
if (!filename) {
  console.error("Usage: bun run certify:device -- /absolute/path/to/accessibility-device.json");
  process.exit(1);
}

const resolved = path.resolve(filename);
const root = path.dirname(resolved);
const evidence = JSON.parse(fs.readFileSync(resolved, "utf8"));
const failures = [];
const placeholder = /REPLACE_|not_run|not_approved/i;
const requiredRoutes = ["/dashboard", "/tenants", "/invoices", "/portal"];

function text(value, label) {
  const result = String(value || "").trim();
  if (!result || placeholder.test(result)) failures.push(`${label} is missing or still contains a placeholder`);
  return result;
}
function routes(entry, label) {
  if (!Array.isArray(entry.routes) || !entry.routes.length) failures.push(`${label}.routes is empty`);
  return new Set((entry.routes || []).map(String));
}
function screenshot(item, label) {
  const relative = text(item?.path, `${label}.path`);
  if (!relative) return;
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`)) failures.push(`${label}.path escapes the evidence directory`);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) failures.push(`${label}.path does not exist`);
  else if (item.sha256) {
    const digest = createHash("sha256").update(fs.readFileSync(target)).digest("hex");
    if (digest !== String(item.sha256).toLowerCase()) failures.push(`${label}.sha256 does not match the screenshot`);
  }
}

if (evidence.schemaVersion !== 1) failures.push("schemaVersion must be 1");
if (!/^[0-9a-f]{40}$/i.test(String(evidence.commit || ""))) failures.push("commit must be an exact 40-character Git SHA");
text(evidence.testedAt, "testedAt");
if (Number.isNaN(Date.parse(evidence.testedAt))) failures.push("testedAt must be an ISO-8601 timestamp");
text(evidence.tester, "tester");
text(evidence.environment, "environment");

const readers = Array.isArray(evidence.screenReaders) ? evidence.screenReaders : [];
if (readers.length < 2) failures.push("At least two screen-reader combinations are required");
let windowsReader = false;
let voiceOver = false;
for (const [index, entry] of readers.entries()) {
  const label = `screenReaders[${index}]`;
  const platform = text(entry.platform, `${label}.platform`);
  const browser = text(entry.browser, `${label}.browser`);
  const assistive = text(entry.assistiveTechnology, `${label}.assistiveTechnology`);
  text(entry.notes, `${label}.notes`);
  if (entry.status !== "passed") failures.push(`${label}.status must be passed`);
  const covered = routes(entry, label);
  if (![...covered].some((route) => route.startsWith("/portal"))) failures.push(`${label} must cover the tenant portal`);
  if (/windows/i.test(platform) && /(nvda|jaws)/i.test(assistive) && /firefox/i.test(browser)) windowsReader = true;
  if (/macos/i.test(platform) && /voiceover/i.test(assistive) && /safari/i.test(browser)) voiceOver = true;
}
if (!windowsReader) failures.push("Windows Firefox with NVDA or JAWS evidence is required");
if (!voiceOver) failures.push("macOS Safari with VoiceOver evidence is required");

const devices = Array.isArray(evidence.devices) ? evidence.devices : [];
if (devices.length < 2) failures.push("At least two physical-device entries are required");
let androidChrome = false;
let iosSafari = false;
const combinedRoutes = new Set();
for (const [index, entry] of devices.entries()) {
  const label = `devices[${index}]`;
  const platform = text(entry.platform, `${label}.platform`);
  const browser = text(entry.browser, `${label}.browser`);
  text(entry.device, `${label}.device`);
  text(entry.notes, `${label}.notes`);
  if (entry.visualReview !== "passed") failures.push(`${label}.visualReview must be passed`);
  if (!Number.isInteger(entry.viewport?.width) || entry.viewport.width < 240 || !Number.isInteger(entry.viewport?.height) || entry.viewport.height < 320) failures.push(`${label}.viewport must contain real CSS-pixel dimensions`);
  for (const route of routes(entry, label)) combinedRoutes.add(route);
  if (!Array.isArray(entry.screenshots) || !entry.screenshots.length) failures.push(`${label}.screenshots is empty`);
  else entry.screenshots.forEach((item, screenshotIndex) => screenshot(item, `${label}.screenshots[${screenshotIndex}]`));
  if (/android/i.test(platform) && /chrome/i.test(browser)) androidChrome = true;
  if (/ios/i.test(platform) && /safari/i.test(browser)) iosSafari = true;
}
if (!androidChrome) failures.push("A physical Android Chrome review is required");
if (!iosSafari) failures.push("A physical iOS Safari review is required");
for (const route of requiredRoutes) if (![...combinedRoutes].some((value) => value === route || value.startsWith(`${route}/`))) failures.push(`Physical-device evidence is missing ${route}`);

if (evidence.approval?.status !== "approved") failures.push("approval.status must be approved");
text(evidence.approval?.approvedBy, "approval.approvedBy");
text(evidence.approval?.approvedAt, "approval.approvedAt");
if (Number.isNaN(Date.parse(evidence.approval?.approvedAt))) failures.push("approval.approvedAt must be an ISO-8601 timestamp");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Accessibility and physical-device evidence is complete for ${evidence.commit}.`);
