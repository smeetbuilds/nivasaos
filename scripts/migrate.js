import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { migrateDatabase } from "../lib/schema/migrate.js";
import { runtimePaths } from "../lib/runtime-paths.js";

const paths = runtimePaths(process.env);
const databasePath = path.resolve(paths.database);
fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
const database = new Database(databasePath, { create: true, strict: true });
try {
  const result = migrateDatabase(database);
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  try { fs.chmodSync(databasePath, 0o600); } catch {}
  if (result.executed.length) console.log(`Applied ${result.executed.length} migration(s): ${result.executed.join(", ")}`);
  else console.log(`Database is current (${result.status.length} migration(s) recorded).`);
} catch (error) {
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  database.close(true);
}
process.exit(process.exitCode || 0);
