const docker = Bun.which("docker");
if (!docker) {
  console.error("Docker is required for gate:container");
  process.exit(1);
}

const project = `nivasaos-gate-${Date.now()}`;
const port = String(34000 + Math.floor(Math.random() * 1000));
const env = { ...process.env, NIVASA_PORT: port };

async function run(args, allowFailure = false) {
  const child = Bun.spawn([docker, ...args], { cwd: process.cwd(), env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  if (!allowFailure && exitCode !== 0) throw new Error(`docker ${args.join(" ")} exited with code ${exitCode}`);
}

async function waitForHealth() {
  let lastError = "container did not become healthy";
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
      const body = await response.json();
      if (response.ok && body.status === "ok") return;
      lastError = `health endpoint returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await Bun.sleep(1000);
  }
  throw new Error(lastError);
}

try {
  await run(["compose", "version"]);
  await run(["compose", "-p", project, "up", "-d", "--build"]);
  await waitForHealth();
  console.log("Docker build, Compose startup, persistent-volume wiring, and container health check passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await run(["compose", "-p", project, "down", "-v", "--remove-orphans"], true);
}

process.exit(process.exitCode || 0);
