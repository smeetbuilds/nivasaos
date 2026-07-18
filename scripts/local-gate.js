import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { Database } from "bun:sqlite";
import { assertRuntimeEnvironment, runtimeValidationErrors } from "../lib/runtime-config.js";

const bun = Bun.which("bun") || process.execPath;
const setsid = process.platform === "win32" ? null : Bun.which("setsid");

async function command(args, env = process.env) {
  const child = Bun.spawn(args, { cwd: process.cwd(), env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${args.join(" ")} exited with code ${exitCode}`);
}

async function waitForHealth(url, child) {
  let lastError = "server did not respond";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Production server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      const body = await response.json();
      if (response.ok && body.status === "ok") return body;
      lastError = `health endpoint returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await Bun.sleep(500);
  }
  throw new Error(`Production health smoke test failed: ${lastError}`);
}

async function smoke(baseUrl, pathname, expectedStatuses, expectedLocation = null) {
  const response = await fetch(`${baseUrl}${pathname}`, { redirect: "manual", signal: AbortSignal.timeout(4000) });
  if (!expectedStatuses.includes(response.status)) throw new Error(`${pathname} returned ${response.status}; expected ${expectedStatuses.join(" or ")}`);
  if (expectedLocation) {
    const location = response.headers.get("location") || "";
    if (!expectedLocation.some((value) => location.includes(value))) throw new Error(`${pathname} redirected to ${location || "nowhere"}`);
  }
  return response;
}

function startServer(env, port) {
  const serverCommand = [bun, "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)];
  return Bun.spawn(setsid ? [setsid, ...serverCommand] : serverCommand, {
    cwd: process.cwd(), env, stdin: "ignore", stdout: "inherit", stderr: "inherit"
  });
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  const signal = (name) => {
    try {
      if (setsid) process.kill(-server.pid, name);
      else server.kill(name);
    } catch {}
  };
  signal("SIGTERM");
  await Promise.race([server.exited, Bun.sleep(5000)]);
  if (server.exitCode === null) signal("SIGKILL");
  server.unref();
}

function verifyRuntimeRejections() {
  const token = "runtime-gate-token-with-32-characters";
  const insecure = runtimeValidationErrors({ NODE_ENV: "production", NIVASA_PUBLIC_URL: "http://example.com", NIVASA_INSTALL_TOKEN: token }, { installed: false });
  if (!insecure.some((error) => error.includes("HTTPS"))) throw new Error("Production runtime accepted an insecure public URL");
  const noToken = runtimeValidationErrors({ NODE_ENV: "production", NIVASA_PUBLIC_URL: "https://example.com" }, { installed: false });
  if (!noToken.some((error) => error.includes("NIVASA_INSTALL_TOKEN"))) throw new Error("Fresh production runtime accepted a missing installer token");
}

const temporary = path.join(tmpdir(), `nivasaos-gate-${randomBytes(6).toString("hex")}`);
const port = 32000 + Math.floor(Math.random() * 2000);
const publicUrl = `http://127.0.0.1:${port}`;
const databasePath = path.join(temporary, "nivasaos.sqlite");
const uploadPath = path.join(temporary, "uploads");
const backupPath = path.join(temporary, "backups");
const archivePath = path.join(temporary, "release-backup.tar.gz");
const proofPath = path.join(uploadPath, "gate-proof.txt");
const env = {
  ...process.env,
  NODE_ENV: "production",
  NIVASA_DB_PATH: databasePath,
  NIVASA_UPLOAD_DIR: uploadPath,
  NIVASA_BACKUP_DIR: backupPath,
  NIVASA_PUBLIC_URL: publicUrl,
  NEXT_PUBLIC_APP_URL: publicUrl,
  NIVASA_ALLOW_INSECURE_LOCALHOST: "1",
  NIVASA_INSTALL_TOKEN: "local-gate-install-token-32-characters"
};
let server = null;

try {
  verifyRuntimeRejections();
  assertRuntimeEnvironment(env, { installed: false });
  await command([bun, "run", "verify"]);
  await command([bun, "run", "build"]);
  await fsp.mkdir(uploadPath, { recursive: true });
  await fsp.mkdir(backupPath, { recursive: true });

  server = startServer(env, port);
  const firstHealth = await waitForHealth(`${publicUrl}/api/health`, server);
  await smoke(publicUrl, "/install", [200]);
  await smoke(publicUrl, "/dashboard", [303, 307, 308], ["/install", "/login"]);
  await smoke(publicUrl, "/portal/login", [200]);
  await stopServer(server);
  server = null;

  const database = new Database(databasePath, { strict: true });
  database.query("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('gate_restore_marker','before-backup',CURRENT_TIMESTAMP)").run();
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  database.close(true);
  await fsp.writeFile(proofPath, "before-backup", { mode: 0o600 });

  await command([bun, "run", "backup", "--", "--output", archivePath], env);
  if (!fs.existsSync(archivePath)) throw new Error("Release backup archive was not created");

  const mutated = new Database(databasePath, { strict: true });
  mutated.query("UPDATE settings SET value='mutated' WHERE key='gate_restore_marker'").run();
  mutated.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  mutated.close(true);
  await fsp.writeFile(proofPath, "mutated", { mode: 0o600 });

  await command([bun, "run", "restore", "--", archivePath, "--force"], env);
  const restored = new Database(databasePath, { readonly: true, strict: true });
  const marker = restored.query("SELECT value FROM settings WHERE key='gate_restore_marker'").get();
  restored.close(true);
  if (marker?.value !== "before-backup") throw new Error("Database backup/restore did not recover the original marker");
  if ((await fsp.readFile(proofPath, "utf8")) !== "before-backup") throw new Error("Upload backup/restore did not recover the original file");

  server = startServer(env, port);
  const restoredHealth = await waitForHealth(`${publicUrl}/api/health`, server);
  await smoke(publicUrl, "/install", [200]);
  await smoke(publicUrl, "/portal/login", [200]);

  console.log(`Production health checks passed before and after restore (${firstHealth.latencyMs}ms / ${restoredHealth.latencyMs}ms).`);
  console.log("Production routes, runtime rejection, database backup, upload backup, restore, and restart checks passed.");
  console.log("Local release gate passed independently of hosted CI.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await stopServer(server);
  if (fs.existsSync(temporary)) await fsp.rm(temporary, { recursive: true, force: true });
}

process.exit(process.exitCode || 0);
