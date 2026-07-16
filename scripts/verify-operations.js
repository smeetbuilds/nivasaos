import { Database } from "bun:sqlite";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { createBackup, inspectBackup, restoreBackup } from "./lib/operations.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.join(tmpdir(), `nivasaos-operations-${randomBytes(6).toString("hex")}`);
const databasePath = path.join(root, "storage", "nivasaos.sqlite");
const uploadsPath = path.join(root, "storage", "uploads");
const backupDirectory = path.join(root, "storage", "backups");
await fsp.mkdir(uploadsPath, { recursive: true });

try {
  const database = new Database(databasePath, { create: true, strict: true });
  database.exec("PRAGMA journal_mode=WAL; CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker VALUES ('before-backup');");
  await Bun.write(path.join(uploadsPath, "proof.txt"), "original-proof");

  const backup = await createBackup({ databasePath, uploadsPath, backupDirectory, applicationVersion: "test" });
  const inspected = await inspectBackup(backup.outputPath);
  assert(inspected.manifest.uploads.count === 1, "Backup manifest did not count uploads");
  database.close(true);

  const mutated = new Database(databasePath, { strict: true });
  mutated.exec("UPDATE marker SET value='after-backup'");
  mutated.close(true);
  await Bun.write(path.join(uploadsPath, "proof.txt"), "mutated-proof");

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
} finally {
  if (fs.existsSync(root)) await fsp.rm(root, { recursive: true, force: true });
}

console.log("Backup creation, checksum inspection, safety backup, and atomic restore verified.");
