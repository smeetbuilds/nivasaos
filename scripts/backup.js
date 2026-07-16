import path from "node:path";
import { createBackup } from "./lib/operations.js";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv.includes("--help")) {
  console.log("Usage: bun run backup [--output /path/to/backup.tar.gz]");
  process.exit(0);
}

try {
  const result = await createBackup({
    outputPath: argument("--output") ? path.resolve(argument("--output")) : undefined,
    applicationVersion: "0.5.0"
  });
  console.log(`Backup created: ${result.outputPath}`);
  console.log(`Database: ${result.manifest.database.bytes} bytes; uploads: ${result.manifest.uploads.count} file(s)`);
} catch (error) {
  console.error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
