import { Database } from "bun:sqlite";
import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runtimePaths } from "../../lib/runtime-paths.js";
import { archiveLimits, extractTarGzip, writeTarGzip } from "./tar-archive.js";

const FORMAT_VERSION = 2;
const SUPPORTED_FORMAT_VERSIONS = new Set([1, 2]);
const DATABASE_ENTRY = "database/nivasaos.sqlite";
const MANIFEST_ENTRY = "manifest.json";

function safeTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function pathIsInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function sqliteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function configuredArchiveLimits(options = {}) {
  const env = options.env || process.env;
  return archiveLimits({
    maxArchiveBytes: options.limits?.maxArchiveBytes ?? env.NIVASA_BACKUP_MAX_ARCHIVE_BYTES,
    maxExpandedBytes: options.limits?.maxExpandedBytes ?? env.NIVASA_BACKUP_MAX_EXPANDED_BYTES,
    maxEntryBytes: options.limits?.maxEntryBytes ?? env.NIVASA_BACKUP_MAX_ENTRY_BYTES,
    maxEntries: options.limits?.maxEntries ?? env.NIVASA_BACKUP_MAX_ENTRIES,
    maxManifestBytes: options.limits?.maxManifestBytes ?? env.NIVASA_BACKUP_MAX_MANIFEST_BYTES
  });
}

function assertHealthyDatabase(filename) {
  const database = new Database(filename, { readonly: true, strict: true });
  try {
    const result = database.query("PRAGMA quick_check").get();
    if (!result || Object.values(result)[0] !== "ok") throw new Error("SQLite quick_check did not return ok");
  } finally {
    database.close(false);
  }
}

async function sha256File(filename) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of fs.createReadStream(filename)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function createDatabaseSnapshot(databasePath, snapshotPath) {
  await fsp.rm(snapshotPath, { force: true });
  const database = new Database(databasePath, { readonly: false, strict: true });
  try {
    const result = database.query("PRAGMA quick_check").get();
    if (!result || Object.values(result)[0] !== "ok") {
      throw new Error("Database integrity check failed; backup was not created");
    }
    database.exec(`VACUUM INTO ${sqliteLiteral(snapshotPath)}`);
  } finally {
    database.close(false);
  }
  await fsp.chmod(snapshotPath, 0o600);
  assertHealthyDatabase(snapshotPath);
}

async function collectUploadFiles(root, limits) {
  const files = [];
  let totalBytes = 0;
  if (!fs.existsSync(root)) return { files, totalBytes };

  async function walk(directory, prefix = "") {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Upload storage contains a symbolic link: ${relative}`);
      if (entry.isDirectory()) {
        await walk(fullPath, relative);
      } else if (entry.isFile()) {
        const stat = await fsp.stat(fullPath);
        if (stat.size > limits.maxEntryBytes) throw new Error(`Upload exceeds the configured per-entry backup limit: ${relative}`);
        totalBytes += stat.size;
        if (totalBytes > limits.maxExpandedBytes) throw new Error("Upload storage exceeds the configured expanded backup limit");
        files.push({ fullPath, archivePath: `uploads/${relative.replaceAll("\\", "/")}`, bytes: stat.size });
        if (files.length + 2 > limits.maxEntries) throw new Error("Upload storage contains too many files for one backup archive");
      } else {
        throw new Error(`Upload storage contains an unsupported filesystem entry: ${relative}`);
      }
    }
  }

  await walk(root);
  files.sort((left, right) => left.archivePath.localeCompare(right.archivePath));
  return { files, totalBytes };
}

export async function createBackup(options = {}) {
  const configured = runtimePaths(options.env);
  const limits = configuredArchiveLimits(options);
  const databasePath = path.resolve(options.databasePath || configured.database);
  const uploadsPath = path.resolve(options.uploadsPath || configured.uploads);
  const backupDirectory = path.resolve(options.backupDirectory || configured.backups);
  const createdAt = new Date();
  const outputPath = path.resolve(
    options.outputPath || path.join(backupDirectory, `nivasaos-backup-${safeTimestamp(createdAt)}.tar.gz`)
  );

  if (!fs.existsSync(databasePath)) throw new Error(`Database does not exist: ${databasePath}`);
  if (outputPath === databasePath || pathIsInside(uploadsPath, outputPath)) {
    throw new Error("Backup output must not be the live database or inside authenticated upload storage");
  }
  await fsp.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const workRoot = await fsp.mkdtemp(path.join(path.dirname(outputPath), ".nivasa-backup-work-"));
  await fsp.chmod(workRoot, 0o700);
  const snapshotPath = path.join(workRoot, "nivasaos.sqlite");

  try {
    await createDatabaseSnapshot(databasePath, snapshotPath);
    const databaseMetadata = await sha256File(snapshotPath);
    if (databaseMetadata.bytes > limits.maxEntryBytes) throw new Error("Database snapshot exceeds the configured per-entry backup limit");

    const uploads = await collectUploadFiles(uploadsPath, limits);
    if (databaseMetadata.bytes + uploads.totalBytes > limits.maxExpandedBytes) {
      throw new Error("Database and uploads exceed the configured expanded backup limit");
    }

    const uploadManifest = [];
    const archiveEntries = [{ entryPath: DATABASE_ENTRY, sourcePath: snapshotPath, sha256: databaseMetadata.sha256 }];
    for (const file of uploads.files) {
      const metadata = await sha256File(file.fullPath);
      if (metadata.bytes !== file.bytes) throw new Error(`Upload changed while the backup was being prepared: ${file.archivePath}`);
      uploadManifest.push({ entry: file.archivePath, bytes: metadata.bytes, sha256: metadata.sha256 });
      archiveEntries.push({ entryPath: file.archivePath, sourcePath: file.fullPath, sha256: metadata.sha256 });
    }

    const manifest = {
      format: "nivasaos-backup",
      formatVersion: FORMAT_VERSION,
      createdAt: createdAt.toISOString(),
      applicationVersion: options.applicationVersion || "1.1.0",
      database: {
        entry: DATABASE_ENTRY,
        bytes: databaseMetadata.bytes,
        sha256: databaseMetadata.sha256
      },
      uploads: {
        count: uploadManifest.length,
        bytes: uploadManifest.reduce((total, item) => total + item.bytes, 0),
        entries: uploadManifest
      }
    };
    const manifestContent = JSON.stringify(manifest, null, 2);
    if (Buffer.byteLength(manifestContent) > limits.maxManifestBytes) throw new Error("Backup manifest exceeds the configured manifest-size limit");
    archiveEntries.push({ entryPath: MANIFEST_ENTRY, content: manifestContent });

    await writeTarGzip(outputPath, archiveEntries, { level: 6, modifiedAt: createdAt, limits });
    return { outputPath, manifest };
  } finally {
    await fsp.rm(workRoot, { recursive: true, force: true });
  }
}

function validateManifest(manifest) {
  if (manifest?.format !== "nivasaos-backup" || !SUPPORTED_FORMAT_VERSIONS.has(Number(manifest?.formatVersion))) {
    throw new Error("Unsupported NivasaOS backup format");
  }
  if (manifest.database?.entry !== DATABASE_ENTRY) throw new Error("Backup manifest references an unexpected database entry");
  if (!Number.isSafeInteger(Number(manifest.database?.bytes)) || Number(manifest.database.bytes) < 0) throw new Error("Backup manifest contains an invalid database size");
  if (!/^[a-f0-9]{64}$/i.test(String(manifest.database?.sha256 || ""))) throw new Error("Backup manifest contains an invalid database checksum");
  if (!Number.isSafeInteger(Number(manifest.uploads?.count)) || Number(manifest.uploads.count) < 0) throw new Error("Backup manifest contains an invalid upload count");
  if (!Number.isSafeInteger(Number(manifest.uploads?.bytes)) || Number(manifest.uploads.bytes) < 0) throw new Error("Backup manifest contains an invalid upload size");
}

export async function inspectBackup(archivePath, options = {}) {
  const resolvedArchive = path.resolve(archivePath);
  const limits = configuredArchiveLimits(options);
  const extractParent = path.resolve(options.extractParent || tmpdir());
  await fsp.mkdir(extractParent, { recursive: true, mode: 0o700 });
  const extractionRoot = await fsp.mkdtemp(path.join(extractParent, ".nivasa-backup-inspect-"));
  await fsp.chmod(extractionRoot, 0o700);

  try {
    const extracted = await extractTarGzip(resolvedArchive, extractionRoot, { limits });
    const manifestFile = extracted.files.get(MANIFEST_ENTRY);
    const databaseFile = extracted.files.get(DATABASE_ENTRY);
    if (!manifestFile || !databaseFile) throw new Error("Backup is missing its manifest or database");
    if (manifestFile.bytes > limits.maxManifestBytes) throw new Error("Backup manifest exceeds the configured manifest-size limit");

    let manifest;
    try {
      manifest = JSON.parse(await fsp.readFile(manifestFile.path, "utf8"));
    } catch {
      throw new Error("Backup manifest is not valid JSON");
    }
    validateManifest(manifest);

    if (databaseFile.bytes !== Number(manifest.database.bytes) || databaseFile.sha256 !== manifest.database.sha256) {
      throw new Error("Backup database checksum does not match the manifest");
    }
    assertHealthyDatabase(databaseFile.path);

    const uploadEntries = [...extracted.files.entries()]
      .filter(([entryPath]) => entryPath.startsWith("uploads/"))
      .sort(([left], [right]) => left.localeCompare(right));
    const unexpected = [...extracted.files.keys()].filter((entryPath) => entryPath !== MANIFEST_ENTRY && entryPath !== DATABASE_ENTRY && !entryPath.startsWith("uploads/"));
    if (unexpected.length) throw new Error(`Backup contains an unexpected entry: ${unexpected[0]}`);
    const uploadBytes = uploadEntries.reduce((total, [, metadata]) => total + metadata.bytes, 0);
    if (uploadEntries.length !== Number(manifest.uploads.count) || uploadBytes !== Number(manifest.uploads.bytes)) {
      throw new Error("Backup upload manifest does not match archive contents");
    }

    if (Number(manifest.formatVersion) >= 2) {
      if (!Array.isArray(manifest.uploads.entries) || manifest.uploads.entries.length !== uploadEntries.length) {
        throw new Error("Backup upload checksum manifest is incomplete");
      }
      const expected = new Map(manifest.uploads.entries.map((item) => [item.entry, item]));
      if (expected.size !== manifest.uploads.entries.length) throw new Error("Backup upload checksum manifest contains duplicate entries");
      for (const [entryPath, metadata] of uploadEntries) {
        const item = expected.get(entryPath);
        if (!item || Number(item.bytes) !== metadata.bytes || item.sha256 !== metadata.sha256) {
          throw new Error(`Backup upload checksum does not match the manifest: ${entryPath}`);
        }
      }
    }

    const uploadsPath = path.join(extractionRoot, "uploads");
    await fsp.mkdir(uploadsPath, { recursive: true, mode: 0o700 });
    return {
      resolvedArchive,
      extractionRoot,
      manifest,
      databasePath: databaseFile.path,
      uploadsPath,
      files: extracted.files,
      cleanup: () => fsp.rm(extractionRoot, { recursive: true, force: true })
    };
  } catch (error) {
    await fsp.rm(extractionRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreBackup(archivePath, options = {}) {
  if (!options.force) throw new Error("Restore requires force=true after the application has been stopped");

  const configured = runtimePaths(options.env);
  const databasePath = path.resolve(options.databasePath || configured.database);
  const uploadsPath = path.resolve(options.uploadsPath || configured.uploads);
  const backupDirectory = path.resolve(options.backupDirectory || configured.backups);
  await fsp.mkdir(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  await fsp.mkdir(path.dirname(uploadsPath), { recursive: true, mode: 0o700 });
  await fsp.mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const inspected = await inspectBackup(archivePath, { ...options, extractParent: backupDirectory });

  const databaseStageRoot = await fsp.mkdtemp(path.join(path.dirname(databasePath), ".nivasa-db-restore-"));
  const uploadsStageRoot = await fsp.mkdtemp(path.join(path.dirname(uploadsPath), ".nivasa-uploads-restore-"));
  await fsp.chmod(databaseStageRoot, 0o700);
  await fsp.chmod(uploadsStageRoot, 0o700);
  const stagedDatabase = path.join(databaseStageRoot, "nivasaos.sqlite");
  const stagedUploads = path.join(uploadsStageRoot, "uploads");

  let safetyBackup = null;
  const oldDatabase = `${databasePath}.restore-old-${process.pid}-${randomBytes(3).toString("hex")}`;
  const oldUploads = `${uploadsPath}.restore-old-${process.pid}-${randomBytes(3).toString("hex")}`;
  let databaseMoved = false;
  let uploadsMoved = false;
  let databaseInstalled = false;
  let uploadsInstalled = false;
  let activated = false;

  try {
    await fsp.copyFile(inspected.databasePath, stagedDatabase, fs.constants.COPYFILE_EXCL);
    await fsp.chmod(stagedDatabase, 0o600);
    assertHealthyDatabase(stagedDatabase);
    await fsp.cp(inspected.uploadsPath, stagedUploads, { recursive: true, force: false, errorOnExist: true });
    await fsp.chmod(stagedUploads, 0o700);

    if (fs.existsSync(databasePath)) {
      safetyBackup = await createBackup({
        databasePath,
        uploadsPath,
        backupDirectory,
        applicationVersion: options.applicationVersion,
        env: options.env,
        limits: options.limits
      });
    }

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
    databaseInstalled = true;
    await fsp.rename(stagedUploads, uploadsPath);
    uploadsInstalled = true;
    await fsp.chmod(databasePath, 0o600);
    assertHealthyDatabase(databasePath);
    activated = true;
  } catch (error) {
    if (databaseInstalled) await fsp.rm(databasePath, { force: true });
    if (uploadsInstalled) await fsp.rm(uploadsPath, { recursive: true, force: true });
    if (databaseMoved && fs.existsSync(oldDatabase)) await fsp.rename(oldDatabase, databasePath);
    if (uploadsMoved && fs.existsSync(oldUploads)) await fsp.rename(oldUploads, uploadsPath);
    throw error;
  } finally {
    await inspected.cleanup().catch(() => {});
    await fsp.rm(databaseStageRoot, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(uploadsStageRoot, { recursive: true, force: true }).catch(() => {});
  }

  if (activated) {
    if (databaseMoved) await fsp.rm(oldDatabase, { force: true }).catch(() => {});
    if (uploadsMoved) await fsp.rm(oldUploads, { recursive: true, force: true }).catch(() => {});
  }

  return { manifest: inspected.manifest, safetyBackup: safetyBackup?.outputPath || null };
}
