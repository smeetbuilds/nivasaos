import { Database } from "bun:sqlite";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { createBackup, inspectBackup, restoreBackup } from "./lib/operations.js";
import { writeTarGzip } from "./lib/tar-archive.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectFailure(callback, message) {
  let failed = false;
  try {
    await callback();
  } catch {
    failed = true;
  }
  assert(failed, message);
}

const root = path.join(tmpdir(), `nivasaos-operations-${randomBytes(6).toString("hex")}`);
const databasePath = path.join(root, "storage", "nivasaos.sqlite");
const uploadsPath = path.join(root, "storage", "uploads");
const backupDirectory = path.join(root, "storage", "backups");
const archivePath = path.join(backupDirectory, "verified.tar.gz");
await fsp.mkdir(uploadsPath, { recursive: true });

try {
  const database = new Database(databasePath, { create: true, strict: true });
  database.exec("PRAGMA journal_mode=WAL; CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker VALUES ('before-backup');");
  await Bun.write(path.join(uploadsPath, "proof.txt"), "original-proof");

  const backup = await createBackup({ databasePath, uploadsPath, backupDirectory, outputPath: archivePath, applicationVersion: "test" });
  assert(backup.manifest.formatVersion === 2, "Backup did not use the checksummed streaming format");
  assert(backup.manifest.uploads.entries?.[0]?.entry === "uploads/proof.txt", "Backup manifest did not retain the upload checksum entry");

  const inspected = await inspectBackup(backup.outputPath, { extractParent: root });
  try {
    assert(inspected.manifest.uploads.count === 1, "Backup manifest did not count uploads");
    assert(inspected.files.get("uploads/proof.txt")?.sha256 === inspected.manifest.uploads.entries[0].sha256, "Upload checksum was not verified during inspection");
  } finally {
    await inspected.cleanup();
  }
  database.close(true);

  const mutated = new Database(databasePath, { strict: true });
  mutated.exec("UPDATE marker SET value='after-backup'");
  mutated.close(true);
  await Bun.write(path.join(uploadsPath, "proof.txt"), "mutated-proof");

  await expectFailure(
    () => restoreBackup(backup.outputPath, {
      databasePath,
      uploadsPath,
      backupDirectory,
      applicationVersion: "test",
      force: true,
      limits: { maxEntryBytes: 1 }
    }),
    "Restore accepted an archive beyond the configured per-entry limit"
  );
  const untouched = new Database(databasePath, { readonly: true, strict: true });
  assert(untouched.query("SELECT value FROM marker").get()?.value === "after-backup", "A pre-activation restore failure modified the live database");
  untouched.close(true);
  assert(await Bun.file(path.join(uploadsPath, "proof.txt")).text() === "mutated-proof", "A pre-activation restore failure modified live uploads");

  const restored = await restoreBackup(backup.outputPath, {
    databasePath,
    uploadsPath,
    backupDirectory,
    applicationVersion: "test",
    force: true
  });
  assert(Boolean(restored.safetyBackup), "Restore did not create a pre-restore safety backup");

  const verified = new Database(databasePath, { readonly: true, strict: true });
  const marker = verified.query("SELECT value FROM marker").get();
  verified.close(true);
  assert(marker.value === "before-backup", "Restored database content does not match the backup");
  assert(await Bun.file(path.join(uploadsPath, "proof.txt")).text() === "original-proof", "Restored upload content does not match the backup");

  await expectFailure(
    () => writeTarGzip(path.join(root, "unsafe.tar.gz"), [{ entryPath: "../escape.txt", content: "escape" }]),
    "Archive writer accepted a traversal path"
  );
  await expectFailure(
    () => createBackup({
      databasePath,
      uploadsPath,
      backupDirectory,
      outputPath: path.join(backupDirectory, "too-small.tar.gz"),
      applicationVersion: "test",
      limits: { maxExpandedBytes: 1 }
    }),
    "Backup accepted data beyond the configured expanded-size limit"
  );

  const backupCli = await Bun.file(new URL("./backup.js", import.meta.url)).text();
  const restoreCli = await Bun.file(new URL("./restore.js", import.meta.url)).text();
  assert(backupCli.includes('from "./lib/operations.js"'), "Backup CLI must import the verified operations implementation");
  assert(restoreCli.includes('from "./lib/operations.js"'), "Restore CLI must import the verified operations implementation");
  assert(!backupCli.includes("./backup/lib/operations.js") && !restoreCli.includes("./backup/lib/operations.js"), "Backup CLI paths must not reference a nonexistent nested directory");
} finally {
  if (fs.existsSync(root)) await fsp.rm(root, { recursive: true, force: true });
}

console.log("Streaming backup creation, checksums, bounded extraction, failure isolation, CLI wiring, safety backup, traversal rejection, and atomic restore verified.");
