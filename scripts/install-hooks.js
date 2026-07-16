const git = Bun.which("git");
if (!git) {
  console.error("Git was not found in PATH.");
  process.exit(1);
}
const result = Bun.spawnSync([git, "config", "core.hooksPath", ".githooks"], { cwd: process.cwd(), stdout: "inherit", stderr: "inherit" });
if (result.exitCode !== 0) process.exit(result.exitCode);
console.log("NivasaOS Git hooks installed. Pre-commit runs quick verification; pre-push runs the full local gate.");
