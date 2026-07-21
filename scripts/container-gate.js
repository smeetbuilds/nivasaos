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
const maxImageBytes = Number(process.env.NIVASA_MAX_IMAGE_BYTES || 350 * 1024 * 1024);
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

async function capture(args) {
  const child = Bun.spawn([docker, ...args], { cwd: process.cwd(), env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (exitCode !== 0) throw new Error(`docker ${args.join(" ")} exited with code ${exitCode}: ${stderr.trim()}`);
  return stdout.trim();
}

async function compose(args, allowFailure = false) {
  await run(["compose", "-p", project, ...args], allowFailure);
}

async function composeCapture(args) {
  return capture(["compose", "-p", project, ...args]);
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
  const imageId = (await composeCapture(["images", "-q", "nivasaos"])).split(/\s+/)[0];
  if (!imageId) throw new Error("Compose did not report the built NivasaOS image");
  const imageBytes = Number(await capture(["image", "inspect", imageId, "--format", "{{.Size}}"]));
  if (!Number.isSafeInteger(imageBytes) || imageBytes <= 0) throw new Error("Container image size could not be measured");
  if (imageBytes > maxImageBytes) throw new Error(`Runtime image is ${imageBytes} bytes; configured maximum is ${maxImageBytes}`);

  const firstHealth = await waitForHealth();
  await runInContainer(`
    import { Database } from "bun:sqlite";
    import fs from "node:fs";
    import path from "node:path";
    if (process.getuid?.() === 0) throw new Error("Application container must not run as root");
    for (const required of ["/app/server.js","/app/scripts/start-container.js","/app/scripts/backup.js","/app/scripts/restore.js","/app/scripts/migrate.js","/app/scripts/create-install-token.js","/app/lib/runtime-config.js"]) {
      if (!fs.existsSync(required)) throw new Error(\`Required runtime operation is missing: \${required}\`);
    }
    for (const forbidden of ["/app/.git","/app/app","/app/components","/app/scripts/verify-source.js","/app/node_modules/.cache"]) {
      if (fs.existsSync(forbidden)) throw new Error(\`Development content leaked into runtime image: \${forbidden}\`);
    }
    const runtimePackage = JSON.parse(await Bun.file("/app/package.json").text());
    if (runtimePackage.scripts?.start !== "bun run scripts/start-container.js") throw new Error("Runtime package does not use the validated startup wrapper");
    const databasePath = process.env.NIVASA_DB_PATH;
    const uploadDirectory = process.env.NIVASA_UPLOAD_DIR;
    if (!databasePath || !uploadDirectory) throw new Error("Persistent container paths are not configured");
    const database = new Database(databasePath, { strict: true });
    const migrations = Number(database.query("SELECT COUNT(*) count FROM schema_migrations").get()?.count || 0);
    if (migrations < 6) throw new Error("Migration ledger is incomplete inside the runtime container");
    database.query("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ($key,$value,CURRENT_TIMESTAMP)").run({ key: ${JSON.stringify(markerKey)}, value: ${JSON.stringify(markerValue)} });
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    database.close(false);
    await Bun.write(path.join(uploadDirectory, ${JSON.stringify(proofName)}), ${JSON.stringify(markerValue)});
  `);
  await compose(["exec", "-T", "nivasaos", "bun", "run", "migrate"]);
  await compose(["exec", "-T", "nivasaos", "bun", "run", "backup", "--", "--output", "/app/backups/container-gate.tar.gz"]);
  await runInContainer(`if (!(await Bun.file("/app/backups/container-gate.tar.gz").exists())) throw new Error("Runtime backup command did not create an archive");`);

  await compose(["restart", "nivasaos"]);
  const restartedHealth = await waitForHealth();

  await runInContainer(`
    import { Database } from "bun:sqlite";
    import path from "node:path";
    if (process.getuid?.() === 0) throw new Error("Application container restarted as root");
    const database = new Database(process.env.NIVASA_DB_PATH, { readonly: true, strict: true });
    const marker = database.query("SELECT value FROM settings WHERE key=$key").get({ key: ${JSON.stringify(markerKey)} });
    const migrations = Number(database.query("SELECT COUNT(*) count FROM schema_migrations").get()?.count || 0);
    database.close(false);
    if (marker?.value !== ${JSON.stringify(markerValue)}) throw new Error("SQLite named volume did not persist across restart");
    if (migrations < 6) throw new Error("Migration ledger did not persist across restart");
    const proof = await Bun.file(path.join(process.env.NIVASA_UPLOAD_DIR, ${JSON.stringify(proofName)})).text();
    if (proof !== ${JSON.stringify(markerValue)}) throw new Error("Upload named volume did not persist across restart");
  `);

  await compose(["ps"]);
  console.log(`Standalone Alpine image, validated startup migration, size ceiling, operator commands, migration ledger, non-root runtime, health, and named-volume persistence passed (${imageBytes} bytes; ${firstHealth.latencyMs}ms / ${restartedHealth.latencyMs}ms).`);
} catch (error) {
  await compose(["logs", "--no-color"], true);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await compose(["down", "-v", "--remove-orphans"], true);
}

process.exit(process.exitCode || 0);
