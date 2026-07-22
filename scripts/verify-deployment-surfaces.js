import fs from "node:fs";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const requireText = (file, values) => {
  if (!fs.existsSync(file)) {
    failures.push(`${file}: missing`);
    return;
  }
  const source = read(file);
  for (const value of values) if (!source.includes(value)) failures.push(`${file}: missing ${value}`);
};

requireText("app/global-error.js", ['"use client"', "<html lang=\"en\">", "reset()", "error?.digest", "Recovery"]);
requireText("app/error.js", ['"use client"', "reset()", "error?.digest", "Your saved data was not changed"]);
requireText("app/not-found.js", ["404", "robots", "Return to start"]);
requireText("app/loading.js", ["SystemLoading", "Loading NivasaOS"]);
requireText("app/(workspace)/error.js", ["WorkspaceError", "Retry view", "error?.digest"]);
requireText("app/(workspace)/loading.js", ["SystemLoading", "Loading workspace view"]);
requireText("app/(workspace)/forbidden/page.js", ["403", "Permission boundary", "No record was disclosed or changed"]);
requireText("components/SystemState.js", ["system-state-card", "system-state-reference", "primaryHref", "secondaryHref"]);
requireText("components/SystemLoading.js", ['role="status"', 'aria-busy="true"', "system-loading-metrics", "system-loading-panels"]);
requireText("lib/permissions.js", ['redirect("/forbidden")']);
requireText("lib/auth.js", ['redirect("/forbidden")']);
requireText("scripts/build-diagnostics.js", ["[nivasa-build]", "phase=preflight", "Build-time", "nextPackage.version", "RENDER_GIT_COMMIT"]);
requireText("app/api/health/route.js", ["release", "RENDER_GIT_COMMIT", "deployment"]);
requireText("Dockerfile", [
  "ARG RENDER_EXTERNAL_URL",
  "ARG RENDER_GIT_COMMIT",
  "NIVASA_BUILD_STAGE=render",
  "NIVASA_DB_PATH=/tmp/nivasaos-build/nivasaos.sqlite",
  "RUN bun run verify",
  "RUN bun run build:diagnostics",
  "RUN bun --bun next build --webpack --debug"
]);
requireText("app/globals.css", ['@import "./styles/system-states.css";']);
requireText("app/styles/system-states.css", [
  "Deployment, loading, error, not-found, and permission-denied states",
  ".system-state-page",
  ".workspace-system-state",
  ".system-loading-metrics",
  "@media (max-width: 520px)",
  "@media (prefers-reduced-motion: reduce)"
]);

for (const file of ["lib/permissions.js", "lib/auth.js"]) {
  if (read(file).includes("/dashboard?error=forbidden")) failures.push(`${file}: legacy dashboard query-string forbidden redirect remains`);
}
const css = read("app/styles/system-states.css");
if (css.includes("overflow-x: auto")) failures.push("System states must not depend on horizontal scrolling");
if (css.includes("border-radius: 20px")) failures.push("System states reintroduced oversized card radii");

const packageJson = JSON.parse(read("package.json"));
if (packageJson.scripts?.["build:diagnostics"] !== "bun run scripts/build-diagnostics.js") failures.push("package.json: build diagnostics command changed");
for (const script of ["verify:ui", "verify:deployment", "verify:release"]) {
  if (!String(packageJson.scripts?.[script] || "").includes("verify-deployment-surfaces.js")) failures.push(`package.json: ${script} does not enforce deployment surfaces`);
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Phase-separated Render builds, sanitized diagnostics, disposable build storage, health release metadata, global recovery, loading, not-found, and stable permission-denied surfaces verified.");
