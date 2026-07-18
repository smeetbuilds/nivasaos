import { Buffer } from "node:buffer";
import { gzipSync, gunzipSync } from "node:zlib";

const BLOCK_SIZE = 512;
const NAME_BYTES = 100;
const PREFIX_BYTES = 155;

function asBuffer(value) {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  throw new TypeError("Archive entry content must be a string, ArrayBuffer, or typed array");
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

export function createTarGzip(entries, options = {}) {
  const modifiedAt = options.modifiedAt instanceof Date ? options.modifiedAt : new Date();
  const chunks = [];
  const seen = new Set();
  const iterable = entries instanceof Map ? entries.entries() : Object.entries(entries || {});
  const normalizedEntries = [...iterable]
    .map(([entryPath, content]) => [normalizeEntryPath(entryPath), asBuffer(content)])
    .sort(([left], [right]) => left.localeCompare(right));

  for (const [entryPath, content] of normalizedEntries) {
    if (seen.has(entryPath)) throw new Error(`Duplicate archive entry: ${entryPath}`);
    seen.add(entryPath);
    chunks.push(createHeader(entryPath, content.length, modifiedAt), content);
    const padding = (BLOCK_SIZE - (content.length % BLOCK_SIZE)) % BLOCK_SIZE;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(BLOCK_SIZE * 2));
  return gzipSync(Buffer.concat(chunks), { level: options.level ?? 6 });
}

export function readTarGzip(bytes) {
  let archive;
  try {
    archive = gunzipSync(asBuffer(bytes));
  } catch {
    throw new Error("Backup is not a valid gzip archive");
  }

  const files = new Map();
  let offset = 0;
  while (offset + BLOCK_SIZE <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK_SIZE);
    if (isZeroBlock(header)) break;
    verifyHeaderChecksum(header);

    const typeFlag = header[156];
    const name = readString(header, 0, NAME_BYTES);
    const prefix = readString(header, 345, PREFIX_BYTES);
    const rawPath = prefix ? `${prefix}/${name}` : name;
    const size = readOctal(header, 124, 12);
    const contentStart = offset + BLOCK_SIZE;
    const contentEnd = contentStart + size;
    if (contentEnd > archive.length) throw new Error(`Backup entry is truncated: ${rawPath}`);

    if (typeFlag === "5".charCodeAt(0)) {
      const directoryPath = rawPath.replace(/\/+$/, "");
      if (directoryPath) normalizeEntryPath(directoryPath);
      offset = contentStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
      continue;
    }
    if (![0, "0".charCodeAt(0)].includes(typeFlag)) throw new Error("Backup contains an unsupported tar entry");

    const entryPath = normalizeEntryPath(rawPath);
    if (files.has(entryPath)) throw new Error(`Backup contains duplicate entry: ${entryPath}`);
    files.set(entryPath, Buffer.from(archive.subarray(contentStart, contentEnd)));
    offset = contentStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
  }

  if (!files.size) throw new Error("Backup archive contains no files");
  return files;
}
