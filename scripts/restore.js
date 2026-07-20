import path from "node:path";
import { inspectBackup, restoreBackup } from "./lib/operations.js";

const archivePath = process.argv.find((value, index) => index > 1 && !value.startsWith("--"));
const forced = process.argv.includes("--force");

if (process.argv.includes("--help") || !archivePath) {
  console.log("Usage: bun run restore /path/to/nivasaos-backup.tar.gz --force");
  console.log("Stop NivasaOS before restoring. A safety backup of the current data is created first.");
  process.exit(archivePath ? 0 : 1);
}

const applicationVersion = JSON.parse(await Bun.file(new URL("../package.json", import.meta.url)).text()).version;
const resolvedArchive = path.resolve(archivePath);
try {
  if (!forced) {
    const inspected = await inspectBackup(resolvedArchive);
    try {
      console.log(`Backup created: ${inspected.manifest.createdAt}`);
      console.log(`Database: ${inspected.manifest.database.bytes} bytes; uploads: ${inspected.manifest.uploads.count} file(s)`);
    } finally {
      await inspected.cleanup();
    }
    throw new Error("Add --force after stopping the application to confirm the restore");
  }

  const result = await restoreBackup(resolvedArchive, { force: true, applicationVersion });
  console.log(`Backup created: ${result.manifest.createdAt}`);
  console.log(`Database: ${result.manifest.database.bytes} bytes; uploads: ${result.manifest.uploads.count} file(s)`);
  console.log("Restore completed successfully.");
  if (result.safetyBackup) console.log(`Pre-restore safety backup: ${result.safetyBackup}`);
} catch (error) {
  console.error(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
