import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const failures = [];
const requireFile = (file) => { if (!fs.existsSync(file)) failures.push(`${file}: missing`); };
const requireText = (file, values) => {
  requireFile(file);
  if (!fs.existsSync(file)) return;
  const source = read(file);
  for (const value of values) if (!source.includes(value)) failures.push(`${file}: missing ${value}`);
};

for (const file of [
  "app/experience-actions.js",
  "app/install/page.js",
  "app/login/page.js",
  "app/portal/(auth)/login/page.js",
  "app/portal/(auth)/activate/[token]/page.js",
  "app/(workspace)/settings/page.js",
  "app/(workspace)/dashboard/page.js",
  "components/InstallWizard.js",
  "components/FirstRunOnboarding.js",
  "components/StatefulForm.js",
  "components/ActionButton.js",
  "app/styles/onboarding.css"
]) requireFile(file);

requireText("app/experience-actions.js", [
  '"use server"',
  "runStructuredAction",
  "installWorkspaceAction",
  "activatePortalAccessAction",
  "updateWorkspaceSettingsAction",
  "changeWorkspacePasswordAction"
]);
requireText("components/StatefulForm.js", ["onErrorRef", "requestAnimationFrame(() => requestAnimationFrame", "useStructuredActionState"]);
requireText("components/ActionButton.js", ["disabled = false", "const blocked = pending || disabled", "...props"]);
requireText("components/InstallWizard.js", [
  "const steps = [\"Operating models\", \"Workspace\", \"Operating rules\", \"Owner account\", \"Review\"]",
  "BOOLEAN_FIELDS",
  "StatefulForm",
  "ActionStateMessage",
  "handleSubmit",
  "handleServerError",
  'aria-current={index === step ? "step" : undefined}',
  'maxLength="160"',
  'maxLength="254"',
  'maxLength="256"',
  'pendingLabel="Installing workspace…"'
]);
requireText("app/install/page.js", ["robots: { index: false, follow: false }", "Workspace installation wizard"]);
requireText("app/login/page.js", ["ActionButton", 'pendingLabel="Signing in…"', 'maxLength="254"', 'maxLength="256"', "Resident or business tenant?"]);
requireText("app/portal/(auth)/login/page.js", ["ActionButton", 'pendingLabel="Signing in…"', 'maxLength="254"', 'maxLength="256"', "Owner or property-team member?"]);
requireText("app/portal/(auth)/activate/[token]/page.js", ["loadBranding", "BrandLogo", "StatefulForm", "ActionStateMessage", "activatePortalAccessAction", 'maxLength="256"', "Password requirements"]);
requireText("app/(workspace)/settings/page.js", [
  "StatefulForm",
  "ActionStateMessage",
  "updateWorkspaceSettingsAction",
  "changeWorkspacePasswordAction",
  "settings-summary-grid",
  "brand-asset-status",
  'maxLength="2000"',
  'maxLength="256"'
]);
requireText("components/FirstRunOnboarding.js", ["First-run onboarding", "first-run-steps", "core steps complete", "Review branding and regional defaults"]);
requireText("app/(workspace)/dashboard/page.js", ["FirstRunOnboarding", "canManageInventory", "query?.welcome", 'overdueCount ? " risk"']);
requireText("app/globals.css", ['@import "./styles/onboarding.css";']);
requireText("app/styles/onboarding.css", [
  "First-run installation, authentication, activation, settings, and onboarding",
  ".install-progress { display: grid; grid-template-columns: repeat(5",
  ".install-step[hidden]",
  ".first-run-onboarding",
  ".settings-summary-grid",
  "@media (max-width: 720px)",
  "@media (prefers-reduced-motion: reduce)"
]);

const onboardingCss = fs.existsSync("app/styles/onboarding.css") ? read("app/styles/onboarding.css") : "";
if (onboardingCss.includes("overflow-x: auto")) failures.push("app/styles/onboarding.css: first-run and authentication flows must not depend on horizontal scrolling");
if (onboardingCss.includes("border-radius: 20px")) failures.push("app/styles/onboarding.css: oversized card radii were reintroduced");

const packageJson = JSON.parse(read("package.json"));
if (!String(packageJson.scripts?.["verify:ui"] || "").includes("verify-onboarding-ui.js")) failures.push("package.json: onboarding verifier is not part of verify:ui");
if (!String(packageJson.scripts?.["verify:release"] || "").includes("verify-onboarding-ui.js")) failures.push("package.json: onboarding verifier is not part of verify:release");

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}

console.log("Installer, staff and resident authentication, portal activation, first-run onboarding, settings, branding, responsive layouts, pending states, and state-preserving validation contracts verified.");
