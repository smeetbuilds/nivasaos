const docker = Bun.which("docker");
if (!docker) {
  console.error("Docker is required for gate:container");
  process.exit(1);
}

const project = `nivasaos-gate-${Date.now()}-${process.pid}`;
const port = String(34000 + Math.floor(Math.random() * 5000));
const markerKey = "container_gate_marker";
const markerValue = `persisted-${Date.now()}`;
const proofName = "container-gate-proof.txt";
const env = {
  ...process.env,
  NIVASA_PORT: port,
  NIVASA_INSTALL_TOKEN: process.env.NIVASA_INSTALL_TOKEN || "container-gate-install-token-32-characters"
};

async function run(args, allowFailure = false) {
  const child = Bun.spawn([docker, ...args], {
    cwd: process.cwd(),
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit"
  });
  const exitCode = await child.exited;
  if (!allowFailure && exitCode !== 0) throw new Error(`docker ${args.join(" ")} exited with code ${exitCode}`);
}

async function compose(args, allowFailure = false) {
  await run(["compose", "-p", project, ...args], allowFailure);
}

async function waitForHealth() {
  let lastError = "container did not become healthy";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
      const body = await response.json();
      if (response.ok && body.status === "ok") return body;
      lastError = `health endpoint returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await Bun.sleep(1000);
  }
  throw new Error(`Container health verification failed: ${lastError}`);
}

async function runInContainer(script) {
  await compose(["exec", "-T", "nivasaos", "bun", "-e", script]);
}

try {
  await run(["compose", "version"]);
  await compose(["config"]);
  await compose(["up", "-d", "--build"]);
  const firstHealth = await waitForHealth();

  await runInContainer(`
    import { Database } from "bun:sqlite";
    import path from "node:path";
    if (process.getuid?.() === 0) throw new Error("Application container must not run as root");
    const databasePath = process.env.NIVASA_DB_PATH;
    const uploadDirectory = process.env.NIVASA_UPLOAD_DIR;
    if (!databasePath || !uploadDirectory) throw new Error("Persistent container paths are not configured");
    const database = new Database(databasePath, { strict: true });
    database.query("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ($key,$value,CURRENT_TIMESTAMP)").run({ key: ${JSON.stringify(markerKey)}, value: ${JSON.stringify(markerValue)} });
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    database.close();
    await Bun.write(path.join(uploadDirectory, ${JSON.stringify(proofName)}), ${JSON.stringify(markerValue)});
  `);

  await compose(["restart", "nivasaos"]);
  const restartedHealth = await waitForHealth();

  await runInContainer(`
    import { Database } from "bun:sqlite";
    import path from "node:path";
    if (process.getuid?.() === 0) throw new Error("Application container restarted as root");
    const database = new Database(process.env.NIVASA_DB_PATH, { readonly: true, strict: true });
    const marker = database.query("SELECT value FROM settings WHERE key=$key").get({ key: ${JSON.stringify(markerKey)} });
    database.close();
    if (marker?.value !== ${JSON.stringify(markerValue)}) throw new Error("SQLite named volume did not persist across restart");
    const proof = await Bun.file(path.join(process.env.NIVASA_UPLOAD_DIR, ${JSON.stringify(proofName)})).text();
    if (proof !== ${JSON.stringify(markerValue)}) throw new Error("Upload named volume did not persist across restart");
  `);

  await compose(["ps"]);
  console.log(`Docker build, Compose startup, non-root runtime, health, and named-volume persistence passed (${firstHealth.latencyMs}ms / ${restartedHealth.latencyMs}ms).`);
} catch (error) {
  await compose(["logs", "--no-color"], true);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await compose(["down", "-v", "--remove-orphans"], true);
}

process.exit(process.exitCode || 0);
