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
requireText("scripts/render-build-gate.sh", [
  "#!/usr/bin/env bash",
  "set -Eeuo pipefail",
  "--capture-only",
  "--enforce-only",
  "NIVASA_RENDER_ARTIFACT_DIR",
  "NIVASA_RENDER_IMAGE_TAG",
  "LC_ALL=C sed 's/[^[:alnum:]_.-]/-/g'",
  "build-metadata.txt",
  "DOCKER_BUILDKIT=1 docker build --pull --progress=plain",
  'RENDER_GIT_COMMIT=${commit}',
  'RENDER_GIT_BRANCH=${branch}',
  "build_status=${PIPESTATUS[0]}",
  "read_recorded_status"
]);
requireText(".circleci/config.yml", [
  "render-build-gate:",
  "Capture Render-equivalent Docker build",
  "bash scripts/render-build-gate.sh --capture-only",
  "destination: render-build",
  "Enforce Render build result",
  "bash scripts/render-build-gate.sh --enforce-only",
  "- render-build-gate"
]);
requireText("docs/RENDER_BUILD_EVIDENCE.md", [
  "bun run gate:render",
  "repository-owned authority",
  "Codespaces",
  "build.log",
  "build-exit-code.txt",
  "build-metadata.txt",
  "first failing Docker layer",
  "must never be supplied as Docker build arguments",
  "does not replace an actual Render deployment"
]);

for (const file of ["lib/permissions.js", "lib/auth.js"]) {
  if (read(file).includes("/dashboard?error=forbidden")) failures.push(`${file}: legacy dashboard query-string forbidden redirect remains`);
}
const css = read("app/styles/system-states.css");
if (css.includes("overflow-x: auto")) failures.push("System states must not depend on horizontal scrolling");
if (css.includes("border-radius: 20px")) failures.push("System states reintroduced oversized card radii");

const renderScript = fs.existsSync("scripts/render-build-gate.sh") ? read("scripts/render-build-gate.sh") : "";
if (renderScript.includes("tr -c")) failures.push("scripts/render-build-gate.sh: image-tag sanitization must not use locale-sensitive tr ranges");
if (renderScript.includes("NIVASA_INSTALL_TOKEN")) failures.push("scripts/render-build-gate.sh: Render build reproduction must not expose the installation token as a build argument");
const buildArguments = [...renderScript.matchAll(/--build-arg\s+"?([A-Z0-9_]+)=/g)].map((match) => match[1]);
const allowedBuildArguments = ["RENDER_EXTERNAL_HOSTNAME", "RENDER_EXTERNAL_URL", "RENDER_GIT_COMMIT", "RENDER_GIT_BRANCH"];
if (JSON.stringify(buildArguments) !== JSON.stringify(allowedBuildArguments)) failures.push(`scripts/render-build-gate.sh: build arguments must exactly equal ${allowedBuildArguments.join(", ")}`);
for (const value of ["build.log", "build-exit-code.txt", "build-metadata.txt", "image-inspect.json", "image-size.jsonl"]) {
  if (!renderScript.includes(value)) failures.push(`scripts/render-build-gate.sh: retained evidence is missing ${value}`);
}

const circleci = fs.existsSync(".circleci/config.yml") ? read(".circleci/config.yml") : "";
const renderJob = circleci.split("\n  render-build-gate:")[1]?.split("\n  container-gate:")[0] || "";
const workflow = circleci.split("\nworkflows:")[1] || "";
if (!renderJob) failures.push(".circleci/config.yml: render-build-gate job block could not be isolated");
if (renderJob.includes("NIVASA_INSTALL_TOKEN")) failures.push(".circleci/config.yml: Render build reproduction must not expose the installation token as a build argument");
if (renderJob.includes("docker build --pull")) failures.push(".circleci/config.yml: Docker reproduction logic must stay in the repository-owned render build script");
for (const value of ["--capture-only", "store_artifacts:", "--enforce-only"]) {
  if (!renderJob.includes(value)) failures.push(`.circleci/config.yml: render-build-gate missing ${value}`);
}
const captureIndex = renderJob.indexOf("--capture-only");
const artifactIndex = renderJob.indexOf("store_artifacts:");
const enforceIndex = renderJob.indexOf("--enforce-only");
if (captureIndex === -1 || artifactIndex === -1 || enforceIndex === -1 || !(captureIndex < artifactIndex && artifactIndex < enforceIndex)) failures.push(".circleci/config.yml: Render evidence must be captured, stored, and then enforced in that order");
if (!workflow.includes("- render-build-gate:")) failures.push(".circleci/config.yml: Render build reproduction is not scheduled on main");
if (!/container-gate:\s*\n\s*requires:\s*\n\s*- release-gate\s*\n\s*- render-build-gate/.test(workflow)) failures.push(".circleci/config.yml: container certification must require both repository and Render build gates");

const packageJson = JSON.parse(read("package.json"));
if (packageJson.scripts?.["build:diagnostics"] !== "bun run scripts/build-diagnostics.js") failures.push("package.json: build diagnostics command changed");
if (packageJson.scripts?.["gate:render"] !== "bash scripts/render-build-gate.sh") failures.push("package.json: repository-owned Render build gate command changed");
for (const script of ["verify:ui", "verify:deployment", "verify:release"]) {
  if (!String(packageJson.scripts?.[script] || "").includes("verify-deployment-surfaces.js")) failures.push(`package.json: ${script} does not enforce deployment surfaces`);
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Repository-owned Render builds, retained failure evidence, sanitized diagnostics, disposable build storage, health release metadata, global recovery, loading, not-found, and stable permission-denied surfaces verified.");
