import fs from "node:fs";
import path from "node:path";
import { assertRuntimeEnvironment, installationExists, normalizedRuntimeEnvironment } from "../lib/runtime-config.js";
import { runtimePaths } from "../lib/runtime-paths.js";

const env = normalizedRuntimeEnvironment(process.env);
const paths = runtimePaths(env);

try {
  for (const directory of [path.dirname(paths.database), paths.uploads, paths.backups]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);
  }
  assertRuntimeEnvironment(env, { installed: installationExists(env) });
} catch (error) {
  console.error("NivasaOS production configuration is invalid:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const bun = Bun.which("bun") || process.execPath;
const migration = Bun.spawn([bun, "run", "scripts/migrate.js"], {
  cwd: process.cwd(),
  env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit"
});
const migrationExit = await migration.exited;
if (migrationExit !== 0) {
  console.error(`NivasaOS startup migration failed with code ${migrationExit}`);
  process.exit(migrationExit || 1);
}

const child = Bun.spawn([bun, "server.js"], {
  cwd: process.cwd(),
  env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit"
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    try { child.kill(signal); } catch {}
  });
}

process.exit(await child.exited);
