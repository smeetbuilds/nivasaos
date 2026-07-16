import "server-only";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { schema } from "@/lib/schema";

const dbPath = path.resolve(process.env.NIVASA_DB_PATH || "./storage/nivasaos.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });

const globalKey = "__nivasaos_db__";
const database = globalThis[globalKey] || new Database(dbPath, { create: true, strict: true });
if (!globalThis[globalKey]) {
  database.exec(schema);
  try { fs.chmodSync(dbPath, 0o600); } catch {}
  globalThis[globalKey] = database;
}

export const db = database;

function call(statement, method, params) {
  return Array.isArray(params) ? statement[method](...params) : statement[method](params);
}

export function all(sql, params = {}) {
  return call(db.query(sql), "all", params);
}

export function get(sql, params = {}) {
  return call(db.query(sql), "get", params);
}

export function run(sql, params = {}) {
  return call(db.query(sql), "run", params);
}

export function scalar(sql, params = {}) {
  const row = get(sql, params);
  return row ? Object.values(row)[0] : null;
}

export function transaction(callback) {
  return db.transaction(callback)();
}
