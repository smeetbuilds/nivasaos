import "server-only";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { applyMigrations, schema } from "@/lib/schema";
import { applyReleaseMigrations } from "@/lib/schema/release-migrations";

const configuredDbPath = process.env.NIVASA_DB_PATH;
const dbPath = configuredDbPath
  ? path.resolve(/* turbopackIgnore: true */ configuredDbPath)
  : path.join(process.cwd(), "storage", "nivasaos.sqlite");
const globalKey = "__nivasaos_db__";

function databaseConnection() {
  if (globalThis[globalKey]) return globalThis[globalKey];
  fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  const database = new Database(dbPath, { create: true, strict: true });
  database.exec("PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = ON;");
  database.exec(schema);
  applyMigrations(database);
  applyReleaseMigrations(database);
  try { fs.chmodSync(dbPath, 0o600); } catch {}
  globalThis[globalKey] = database;
  return database;
}

function call(sql, method, params) {
  const statement = databaseConnection().query(sql);
  return Array.isArray(params) ? statement[method](...params) : statement[method](params);
}

export function all(sql, params = {}) { return call(sql, "all", params); }
export function get(sql, params = {}) { return call(sql, "get", params); }
export function run(sql, params = {}) { return call(sql, "run", params); }
export function scalar(sql, params = {}) { const row = get(sql, params); return row ? Object.values(row)[0] : null; }
export function transaction(callback) { return databaseConnection().transaction(callback)(); }
