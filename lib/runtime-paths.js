import path from "node:path";

function resolvePath(value, fallback) {
  return value ? path.resolve(value) : path.join(process.cwd(), ...fallback);
}

export function runtimePaths(env = process.env) {
  return {
    database: resolvePath(env.NIVASA_DB_PATH, ["storage", "nivasaos.sqlite"]),
    uploads: resolvePath(env.NIVASA_UPLOAD_DIR, ["storage", "uploads"]),
    backups: resolvePath(env.NIVASA_BACKUP_DIR, ["storage", "backups"])
  };
}
