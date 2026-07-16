import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

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

const temporary = path.join(tmpdir(), `nivasaos-gate-${randomBytes(6).toString("hex")}`);
const port = 32000 + Math.floor(Math.random() * 2000);
let server = null;
try {
  await command([bun, "run", "verify"]);
  await command([bun, "run", "build"]);
  await fsp.mkdir(path.join(temporary, "uploads"), { recursive: true });
  const env = {
    ...process.env,
    NODE_ENV: "production",
    NIVASA_DB_PATH: path.join(temporary, "nivasaos.sqlite"),
    NIVASA_UPLOAD_DIR: path.join(temporary, "uploads"),
    NIVASA_BACKUP_DIR: path.join(temporary, "backups"),
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`
  };
  const serverCommand = [bun, "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)];
  server = Bun.spawn(setsid ? [setsid, ...serverCommand] : serverCommand, {
    cwd: process.cwd(), env, stdin: "ignore", stdout: "inherit", stderr: "inherit"
  });
  const health = await waitForHealth(`http://127.0.0.1:${port}/api/health`, server);
  console.log(`Production health check passed in ${health.latencyMs}ms.`);
  console.log("Local release gate passed without GitHub Actions or another hosted CI service.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
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
  if (fs.existsSync(temporary)) await fsp.rm(temporary, { recursive: true, force: true });
}

process.exit(process.exitCode || 0);
