import { assertRuntimeEnvironment, installationExists, normalizedRuntimeEnvironment } from "../lib/runtime-config.js";

const env = normalizedRuntimeEnvironment(process.env);
try {
  assertRuntimeEnvironment(env, { installed: installationExists(env) });
} catch (error) {
  console.error("NivasaOS production configuration is invalid:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const bun = Bun.which("bun") || process.execPath;
const host = String(env.HOST || "0.0.0.0");
const port = String(env.PORT || "3000");
const child = Bun.spawn([bun, "node_modules/next/dist/bin/next", "start", "-H", host, "-p", port], {
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
