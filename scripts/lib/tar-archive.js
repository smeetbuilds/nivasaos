import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";

const BLOCK_SIZE = 512;
const NAME_BYTES = 100;
const PREFIX_BYTES = 155;

export const DEFAULT_ARCHIVE_LIMITS = Object.freeze({
  maxArchiveBytes: 8 * 1024 * 1024 * 1024,
  maxExpandedBytes: 32 * 1024 * 1024 * 1024,
  maxEntryBytes: 8 * 1024 * 1024 * 1024,
  maxEntries: 100_000,
  maxManifestBytes: 1024 * 1024
});

function asBuffer(value) {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  throw new TypeError("Archive entry content must be a string, ArrayBuffer, or typed array");
}

function positiveInteger(value, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive safe integer`);
  return parsed;
}

export function archiveLimits(overrides = {}) {
  return {
    maxArchiveBytes: positiveInteger(overrides.maxArchiveBytes, DEFAULT_ARCHIVE_LIMITS.maxArchiveBytes, "Maximum archive bytes"),
    maxExpandedBytes: positiveInteger(overrides.maxExpandedBytes, DEFAULT_ARCHIVE_LIMITS.maxExpandedBytes, "Maximum expanded bytes"),
    maxEntryBytes: positiveInteger(overrides.maxEntryBytes, DEFAULT_ARCHIVE_LIMITS.maxEntryBytes, "Maximum entry bytes"),
    maxEntries: positiveInteger(overrides.maxEntries, DEFAULT_ARCHIVE_LIMITS.maxEntries, "Maximum entry count"),
    maxManifestBytes: positiveInteger(overrides.maxManifestBytes, DEFAULT_ARCHIVE_LIMITS.maxManifestBytes, "Maximum manifest bytes")
  };
}

function normalizeEntryPath(value) {
  const normalized = String(value || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) {
    throw new Error(`Unsafe archive entry path: ${value}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe archive entry path: ${value}`);
  }
  return normalized;
}

function splitEntryPath(entryPath) {
  if (Buffer.byteLength(entryPath) <= NAME_BYTES) return { name: entryPath, prefix: "" };
  let slash = entryPath.lastIndexOf("/");
  while (slash > 0) {
    const prefix = entryPath.slice(0, slash);
    const name = entryPath.slice(slash + 1);
    if (Buffer.byteLength(name) <= NAME_BYTES && Buffer.byteLength(prefix) <= PREFIX_BYTES) {
      return { name, prefix };
    }
    slash = entryPath.lastIndexOf("/", slash - 1);
  }
  throw new Error(`Archive entry path is too long for USTAR: ${entryPath}`);
}

function writeString(buffer, offset, length, value) {
  const bytes = Buffer.from(String(value), "utf8");
  if (bytes.length > length) throw new Error(`Tar header value exceeds ${length} bytes`);
  bytes.copy(buffer, offset);
}

function writeOctal(buffer, offset, length, value) {
  const integer = Math.max(0, Math.floor(Number(value) || 0));
  const digits = integer.toString(8);
  if (digits.length > length - 1) throw new Error("Tar numeric field overflow");
  writeString(buffer, offset, length, `${digits.padStart(length - 1, "0")}\0`);
}

function createHeader(entryPath, size, modifiedAt) {
  const header = Buffer.alloc(BLOCK_SIZE);
  const { name, prefix } = splitEntryPath(entryPath);
  writeString(header, 0, NAME_BYTES, name);
  writeOctal(header, 100, 8, 0o600);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, Math.floor(modifiedAt.getTime() / 1000));
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  writeString(header, 265, 32, "nivasaos");
  writeString(header, 297, 32, "nivasaos");
  if (prefix) writeString(header, 345, PREFIX_BYTES, prefix);

  let checksum = 0;
  for (const byte of header) checksum += byte;
  const digits = checksum.toString(8);
  if (digits.length > 6) throw new Error("Tar checksum overflow");
  writeString(header, 148, 6, digits.padStart(6, "0"));
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function readString(buffer, offset, length) {
  const slice = buffer.subarray(offset, offset + length);
  const nullIndex = slice.indexOf(0);
  return slice.subarray(0, nullIndex === -1 ? slice.length : nullIndex).toString("utf8").trimEnd();
}

function readOctal(buffer, offset, length) {
  const value = readString(buffer, offset, length).trim();
  if (!value) return 0;
  if (!/^[0-7]+$/.test(value)) throw new Error("Invalid tar numeric field");
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed)) throw new Error("Tar numeric field is too large");
  return parsed;
}

function verifyHeaderChecksum(header) {
  const expected = readOctal(header, 148, 8);
  let actual = 0;
  for (let index = 0; index < BLOCK_SIZE; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (actual !== expected) throw new Error("Tar header checksum does not match");
}

function isZeroBlock(block) {
  for (const byte of block) if (byte !== 0) return false;
  return true;
}

async function preparedEntries(entries, limits) {
  const normalized = [];
  const seen = new Set();
  let totalBytes = 0;
  for (const entry of entries || []) {
    const entryPath = normalizeEntryPath(entry.entryPath);
    if (seen.has(entryPath)) throw new Error(`Duplicate archive entry: ${entryPath}`);
    seen.add(entryPath);
    if (seen.size > limits.maxEntries) throw new Error("Backup contains too many archive entries");

    if (entry.sourcePath) {
      const sourcePath = path.resolve(entry.sourcePath);
      const stat = await fsp.stat(sourcePath);
      if (!stat.isFile()) throw new Error(`Archive source is not a regular file: ${sourcePath}`);
      if (stat.size > limits.maxEntryBytes) throw new Error(`Archive entry exceeds the configured size limit: ${entryPath}`);
      totalBytes += stat.size;
      normalized.push({ entryPath, sourcePath, size: stat.size, expectedSha256: entry.sha256 || null });
    } else {
      const content = asBuffer(entry.content ?? "");
      if (content.byteLength > limits.maxEntryBytes) throw new Error(`Archive entry exceeds the configured size limit: ${entryPath}`);
      totalBytes += content.byteLength;
      normalized.push({ entryPath, content, size: content.byteLength });
    }
    if (totalBytes > limits.maxExpandedBytes) throw new Error("Backup content exceeds the configured expanded-size limit");
  }
  return normalized.sort((left, right) => left.entryPath.localeCompare(right.entryPath));
}

async function* tarChunks(entries, modifiedAt) {
  for (const entry of entries) {
    yield createHeader(entry.entryPath, entry.size, modifiedAt);
    if (entry.sourcePath) {
      const hash = createHash("sha256");
      let streamed = 0;
      const source = fs.createReadStream(entry.sourcePath, entry.size ? { start: 0, end: entry.size - 1 } : undefined);
      for await (const chunk of source) {
        streamed += chunk.length;
        if (streamed > entry.size) throw new Error(`Archive source grew while being read: ${entry.entryPath}`);
        hash.update(chunk);
        yield chunk;
      }
      if (streamed !== entry.size) throw new Error(`Archive source changed size while being read: ${entry.entryPath}`);
      if (entry.expectedSha256 && hash.digest("hex") !== entry.expectedSha256) {
        throw new Error(`Archive source changed while being read: ${entry.entryPath}`);
      }
    } else if (entry.content.byteLength) {
      yield entry.content;
    }
    const padding = (BLOCK_SIZE - (entry.size % BLOCK_SIZE)) % BLOCK_SIZE;
    if (padding) yield Buffer.alloc(padding);
  }
  yield Buffer.alloc(BLOCK_SIZE * 2);
}

function byteLimitTransform(maximum, message) {
  let total = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > maximum) callback(new Error(message));
      else callback(null, chunk);
    }
  });
}

export async function writeTarGzip(outputPath, entries, options = {}) {
  const limits = archiveLimits(options.limits);
  const modifiedAt = options.modifiedAt instanceof Date ? options.modifiedAt : new Date();
  const normalized = await preparedEntries(entries, limits);
  const resolvedOutput = path.resolve(outputPath);
  await fsp.mkdir(path.dirname(resolvedOutput), { recursive: true, mode: 0o700 });
  const temporary = `${resolvedOutput}.tmp-${process.pid}-${randomBytes(5).toString("hex")}`;
  try {
    await pipeline(
      Readable.from(tarChunks(normalized, modifiedAt)),
      createGzip({ level: options.level ?? 6 }),
      byteLimitTransform(limits.maxArchiveBytes, "Compressed backup exceeds the configured archive-size limit"),
      fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 })
    );
    const stat = await fsp.stat(temporary);
    if (stat.size > limits.maxArchiveBytes) throw new Error("Compressed backup exceeds the configured archive-size limit");
    await fsp.chmod(temporary, 0o600);
    await fsp.rename(temporary, resolvedOutput);
  } catch (error) {
    await fsp.rm(temporary, { force: true });
    throw error;
  }
  return resolvedOutput;
}

class ByteReader {
  constructor(stream, maxExpandedBytes) {
    this.iterator = stream[Symbol.asyncIterator]();
    this.queue = [];
    this.buffered = 0;
    this.consumed = 0;
    this.done = false;
    this.maxExpandedBytes = maxExpandedBytes;
  }

  async fill(minimum) {
    while (this.buffered < minimum && !this.done) {
      const next = await this.iterator.next();
      if (next.done) {
        this.done = true;
        break;
      }
      const chunk = Buffer.from(next.value);
      if (!chunk.length) continue;
      this.queue.push(chunk);
      this.buffered += chunk.length;
    }
  }

  take(maximum) {
    const first = this.queue[0];
    if (!first) return null;
    const length = Math.min(maximum, first.length);
    const chunk = first.subarray(0, length);
    if (length === first.length) this.queue.shift();
    else this.queue[0] = first.subarray(length);
    this.buffered -= length;
    this.consumed += length;
    if (this.consumed > this.maxExpandedBytes) throw new Error("Backup expands beyond the configured decompressed-size limit");
    return chunk;
  }

  async readExactly(length) {
    if (!Number.isSafeInteger(length) || length < 0) throw new Error("Invalid archive read length");
    await this.fill(length);
    if (this.buffered < length) throw new Error("Backup archive is truncated");
    if (length === 0) return Buffer.alloc(0);
    const chunks = [];
    let remaining = length;
    while (remaining > 0) {
      const chunk = this.take(remaining);
      chunks.push(chunk);
      remaining -= chunk.length;
    }
    return chunks.length === 1 ? Buffer.from(chunks[0]) : Buffer.concat(chunks, length);
  }

  async writeExactly(length, handle, hash) {
    let remaining = length;
    let position = 0;
    while (remaining > 0) {
      await this.fill(1);
      if (!this.buffered) throw new Error("Backup archive is truncated");
      const chunk = this.take(remaining);
      await handle.write(chunk, 0, chunk.length, position);
      hash.update(chunk);
      position += chunk.length;
      remaining -= chunk.length;
    }
  }

  async skipExactly(length) {
    let remaining = length;
    while (remaining > 0) {
      await this.fill(1);
      if (!this.buffered) throw new Error("Backup archive is truncated");
      const chunk = this.take(remaining);
      remaining -= chunk.length;
    }
  }

  async assertOnlyZeroPadding() {
    while (true) {
      await this.fill(1);
      if (!this.buffered && this.done) return;
      const chunk = this.take(this.buffered);
      for (const byte of chunk) if (byte !== 0) throw new Error("Backup tar contains data after its end marker");
    }
  }
}

function safeDestination(root, entryPath) {
  const target = path.resolve(root, ...entryPath.split("/"));
  const prefix = `${path.resolve(root)}${path.sep}`;
  if (!target.startsWith(prefix)) throw new Error(`Unsafe archive destination: ${entryPath}`);
  return target;
}

export async function extractTarGzip(archivePath, destination, options = {}) {
  const limits = archiveLimits(options.limits);
  const resolvedArchive = path.resolve(archivePath);
  const archiveStat = await fsp.stat(resolvedArchive).catch(() => null);
  if (!archiveStat?.isFile()) throw new Error(`Backup does not exist: ${resolvedArchive}`);
  if (archiveStat.size > limits.maxArchiveBytes) throw new Error("Backup archive exceeds the configured compressed-size limit");

  const resolvedDestination = path.resolve(destination);
  const destinationStat = await fsp.lstat(resolvedDestination).catch(() => null);
  if (destinationStat?.isSymbolicLink() || (destinationStat && !destinationStat.isDirectory())) {
    throw new Error("Backup extraction destination must be a real directory");
  }
  if (destinationStat && (await fsp.readdir(resolvedDestination)).length) {
    throw new Error("Backup extraction destination must be empty");
  }
  await fsp.mkdir(resolvedDestination, { recursive: true, mode: 0o700 });
  await fsp.chmod(resolvedDestination, 0o700);

  const input = fs.createReadStream(resolvedArchive);
  const gunzip = createGunzip();
  input.pipe(gunzip);
  const reader = new ByteReader(gunzip, limits.maxExpandedBytes);
  const files = new Map();
  const seen = new Set();
  let entryCount = 0;
  let fileBytes = 0;

  try {
    while (true) {
      const header = await reader.readExactly(BLOCK_SIZE);
      if (isZeroBlock(header)) {
        const second = await reader.readExactly(BLOCK_SIZE);
        if (!isZeroBlock(second)) throw new Error("Backup tar trailer is invalid");
        await reader.assertOnlyZeroPadding();
        break;
      }
      verifyHeaderChecksum(header);
      const typeFlag = header[156];
      const name = readString(header, 0, NAME_BYTES);
      const prefix = readString(header, 345, PREFIX_BYTES);
      const entryPath = normalizeEntryPath(prefix ? `${prefix}/${name}` : name);
      const size = readOctal(header, 124, 12);
      entryCount += 1;
      if (entryCount > limits.maxEntries) throw new Error("Backup contains too many archive entries");
      if (size > limits.maxEntryBytes) throw new Error(`Backup entry exceeds the configured size limit: ${entryPath}`);
      if (seen.has(entryPath)) throw new Error(`Backup contains duplicate entry: ${entryPath}`);
      seen.add(entryPath);

      if (typeFlag === "5".charCodeAt(0)) {
        if (size !== 0) throw new Error(`Backup directory entry has unexpected content: ${entryPath}`);
        await fsp.mkdir(safeDestination(resolvedDestination, entryPath), { recursive: true, mode: 0o700 });
      } else {
        if (![0, "0".charCodeAt(0)].includes(typeFlag)) throw new Error("Backup contains an unsupported tar entry");
        fileBytes += size;
        if (fileBytes > limits.maxExpandedBytes) throw new Error("Backup file content exceeds the configured expanded-size limit");
        const target = safeDestination(resolvedDestination, entryPath);
        await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        const handle = await fsp.open(target, "wx", 0o600);
        const hash = createHash("sha256");
        try {
          await reader.writeExactly(size, handle, hash);
          await handle.chmod(0o600);
        } finally {
          await handle.close();
        }
        files.set(entryPath, { path: target, bytes: size, sha256: hash.digest("hex") });
      }

      const padding = (BLOCK_SIZE - (size % BLOCK_SIZE)) % BLOCK_SIZE;
      if (padding) await reader.skipExactly(padding);
    }
  } catch (error) {
    input.destroy();
    gunzip.destroy();
    await fsp.rm(resolvedDestination, { recursive: true, force: true });
    throw error;
  }

  return { resolvedArchive, resolvedDestination, files, expandedBytes: reader.consumed };
}
