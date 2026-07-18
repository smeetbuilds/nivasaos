import { Database } from "bun:sqlite";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { runtimePaths } from "../../lib/runtime-paths.js";
import { createTarGzip, readTarGzip } from "./tar-archive.js";

const FORMAT_VERSION = 1;
const DATABASE_ENTRY = "database/nivasaos.sqlite";
const MANIFEST_ENTRY = "manifest.json";

function safeTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertHealthyDatabase(filename) {
  const database = new Database(filename, { readonly: true, strict: true });
  try {
    const result = database.query("PRAGMA quick_check").get();
    if (!result || Object.values(result)[0] !== "ok") {
      throw new Error("SQLite quick_check did not return ok");
    }
  } finally {
    database.close(true);
  }
}

async function collectUploadFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;

  async function walk(directory, prefix = "") {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(fullPath, relative);
      } else if (entry.isFile()) {
        files.push({ fullPath, archivePath: `uploads/${relative.replaceAll("\\", "/")}` });
      }
    }
  }

  await walk(root);
  return files;
}

async function writeAtomic(filename, content) {
  await fsp.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    await Bun.write(temporary, content);
    await fsp.chmod(temporary, 0o600);
    await fsp.rename(temporary, filename);
  } catch (error) {
    await fsp.rm(temporary, { force: true });
    throw error;
  }
}

export async function createBackup(options = {}) {
  const configured = runtimePaths(options.env);
  const databasePath = path.resolve(options.databasePath || configured.database);
  const uploadsPath = path.resolve(options.uploadsPath || configured.uploads);
  const backupDirectory = path.resolve(options.backupDirectory || configured.backups);

  if (!fs.existsSync(databasePath)) {
    throw new Error(`Database does not exist: ${databasePath}`);
  }

  const database = new Database(databasePath, { readonly: true, strict: true });
  let databaseBytes;
  try {
    const result = database.query("PRAGMA quick_check").get();
    if (!result || Object.values(result)[0] !== "ok") {
      throw new Error("Database integrity check failed; backup was not created");
    }
    databaseBytes = database.serialize();
  } finally {
    database.close(true);
  }

  const uploadFiles = await collectUploadFiles(uploadsPath);
  const createdAt = new Date();
  const outputPath = path.resolve(
    options.outputPath || path.join(backupDirectory, `nivasaos-backup-${safeTimestamp(createdAt)}.tar.gz`)
  );
  const archiveEntries = {
    [DATABASE_ENTRY]: databaseBytes
  };
  let uploadBytes = 0;
  for (const file of uploadFiles) {
    const stat = await fsp.stat(file.fullPath);
    uploadBytes += stat.size;
    archiveEntries[file.archivePath] = await Bun.file(file.fullPath).bytes();
  }

  const manifest = {
    format: "nivasaos-backup",
    formatVersion: FORMAT_VERSION,
    createdAt: createdAt.toISOString(),
    applicationVersion: options.applicationVersion || "0.5.0",
    database: {
      entry: DATABASE_ENTRY,
      bytes: databaseBytes.byteLength,
      sha256: sha256(databaseBytes)
    },
    uploads: {
      count: uploadFiles.length,
      bytes: uploadBytes
    }
  };
  archiveEntries[MANIFEST_ENTRY] = JSON.stringify(manifest, null, 2);

  const archive = createTarGzip(archiveEntries, { level: 6, modifiedAt: createdAt });
  await writeAtomic(outputPath, archive);

  return { outputPath, manifest };
}

export async function inspectBackup(archivePath) {
  const resolvedArchive = path.resolve(archivePath);
  if (!fs.existsSync(resolvedArchive)) throw new Error(`Backup does not exist: ${resolvedArchive}`);

  const files = readTarGzip(await Bun.file(resolvedArchive).bytes());
  const manifestFile = files.get(MANIFEST_ENTRY);
  const databaseFile = files.get(DATABASE_ENTRY);
  if (!manifestFile || !databaseFile) throw new Error("Backup is missing its manifest or database");

  const manifest = JSON.parse(new TextDecoder().decode(manifestFile));
  if (manifest.format !== "nivasaos-backup" || manifest.formatVersion !== FORMAT_VERSION) {
    throw new Error("Unsupported NivasaOS backup format");
  }

  const databaseBytes = new Uint8Array(databaseFile);
  if (databaseBytes.byteLength !== Number(manifest.database?.bytes) || sha256(databaseBytes) !== manifest.database?.sha256) {
    throw new Error("Backup database checksum does not match the manifest");
  }

  const uploadEntries = [...files.entries()].filter(([entryPath]) => entryPath.startsWith("uploads/"));
  const uploadBytes = uploadEntries.reduce((total, [, bytes]) => total + bytes.byteLength, 0);
  if (uploadEntries.length !== Number(manifest.uploads?.count) || uploadBytes !== Number(manifest.uploads?.bytes)) {
    throw new Error("Backup upload manifest does not match archive contents");
  }

  return { resolvedArchive, files, manifest, databaseBytes };
}

export async function restoreBackup(archivePath, options = {}) {
  if (!options.force) throw new Error("Restore requires force=true after the application has been stopped");

  const configured = runtimePaths(options.env);
  const databasePath = path.resolve(options.databasePath || configured.database);
  const uploadsPath = path.resolve(options.uploadsPath || configured.uploads);
  const backupDirectory = path.resolve(options.backupDirectory || configured.backups);
  const inspected = await inspectBackup(archivePath);

  let safetyBackup = null;
  if (fs.existsSync(databasePath)) {
    safetyBackup = await createBackup({ databasePath, uploadsPath, backupDirectory, applicationVersion: options.applicationVersion });
  }

  const stageRoot = path.join(path.dirname(databasePath), `.nivasa-restore-${process.pid}-${randomBytes(5).toString("hex")}`);
  const stagedDatabase = path.join(stageRoot, "nivasaos.sqlite");
  const stagedUploads = path.join(stageRoot, "uploads");
  const oldDatabase = `${databasePath}.restore-old-${process.pid}`;
  const oldUploads = `${uploadsPath}.restore-old-${process.pid}`;

  await fsp.mkdir(stagedUploads, { recursive: true, mode: 0o700 });
  await Bun.write(stagedDatabase, inspected.databaseBytes);
  await fsp.chmod(stagedDatabase, 0o600);
  assertHealthyDatabase(stagedDatabase);

  for (const [entryPath, file] of inspected.files) {
    if (!entryPath.startsWith("uploads/")) continue;
    const relative = entryPath.slice("uploads/".length);
    if (!relative || relative.split("/").some((part) => part === ".." || part === ".")) {
      throw new Error(`Unsafe upload path in backup: ${entryPath}`);
    }
    const target = path.join(stagedUploads, ...relative.split("/"));
    await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await Bun.write(target, file);
    await fsp.chmod(target, 0o600);
  }

  await fsp.mkdir(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  let databaseMoved = false;
  let uploadsMoved = false;
  try {
    for (const suffix of ["-wal", "-shm"]) await fsp.rm(databasePath + suffix, { force: true });
    if (fs.existsSync(databasePath)) {
      await fsp.rename(databasePath, oldDatabase);
      databaseMoved = true;
    }
    if (fs.existsSync(uploadsPath)) {
      await fsp.rename(uploadsPath, oldUploads);
      uploadsMoved = true;
    }
    await fsp.rename(stagedDatabase, databasePath);
    await fsp.rename(stagedUploads, uploadsPath);
    assertHealthyDatabase(databasePath);
    if (databaseMoved) await fsp.rm(oldDatabase, { force: true });
    if (uploadsMoved) await fsp.rm(oldUploads, { recursive: true, force: true });
  } catch (error) {
    await fsp.rm(databasePath, { force: true });
    await fsp.rm(uploadsPath, { recursive: true, force: true });
    if (databaseMoved && fs.existsSync(oldDatabase)) await fsp.rename(oldDatabase, databasePath);
    if (uploadsMoved && fs.existsSync(oldUploads)) await fsp.rename(oldUploads, uploadsPath);
    throw error;
  } finally {
    await fsp.rm(stageRoot, { recursive: true, force: true });
  }

  return { manifest: inspected.manifest, safetyBackup: safetyBackup?.outputPath || null };
}
