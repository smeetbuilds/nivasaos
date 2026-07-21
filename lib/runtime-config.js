import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { Database } from "bun:sqlite";
import { runtimePaths } from "./runtime-paths.js";

const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const placeholderToken = /(?:replace|change|example|placeholder|local-development|your[-_ ]|generated)/i;

function configuredInstallToken(env = process.env) {
  return String(env.NIVASA_INSTALL_TOKEN || "").trim();
}

export function configuredPublicUrl(env = process.env) {
  const configured = String(env.NIVASA_PUBLIC_URL || env.NEXT_PUBLIC_APP_URL || "").trim();
  const managedPlatform = String(env.RENDER_EXTERNAL_URL || "").trim();
  return String(configured || managedPlatform).trim().replace(/\/+$/, "");
}

export function installationExists(env = process.env) {
  const databasePath = runtimePaths(env).database;
  if (!fs.existsSync(databasePath)) return false;
  let database;
  try {
    database = new Database(databasePath, { readonly: true, strict: true });
    const table = database.query("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (!table) return false;
    const row = database.query("SELECT COUNT(*) count FROM users WHERE role='owner'").get();
    return Number(row?.count || 0) > 0;
  } catch {
    return false;
  } finally {
    database?.close(false);
  }
}

function installTokenIsValid(env = process.env) {
  const token = configuredInstallToken(env);
  const localOverride = String(env.NIVASA_ALLOW_INSECURE_LOCALHOST || "") === "1";
  return token.length >= 24 && new Set(token).size >= 10 && (localOverride || !placeholderToken.test(token));
}

export function installationProtection(env = process.env) {
  const required = env.NODE_ENV === "production" || Boolean(configuredInstallToken(env));
  const configured = !required || installTokenIsValid(env);
  return { required, configured };
}

export function assertInstallationToken(candidate, env = process.env) {
  const protection = installationProtection(env);
  if (!protection.required) return;
  const expected = configuredInstallToken(env);
  if (!protection.configured) throw new Error("NIVASA_INSTALL_TOKEN must be a generated value of at least 24 characters before production installation");
  const supplied = String(candidate || "").trim();
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    throw new Error("Installation token is invalid");
  }
}

export function runtimeValidationErrors(env = process.env, options = {}) {
  if (env.NODE_ENV !== "production") return [];
  const errors = [];
  const allowInsecureLocalhost = String(env.NIVASA_ALLOW_INSECURE_LOCALHOST || "") === "1";
  const publicUrl = configuredPublicUrl(env);
  if (!publicUrl) errors.push("NIVASA_PUBLIC_URL is required in production unless the platform provides RENDER_EXTERNAL_URL");
  else {
    try {
      const parsed = new URL(publicUrl);
      const local = localHosts.has(parsed.hostname);
      if (!allowInsecureLocalhost && parsed.protocol !== "https:") errors.push("NIVASA_PUBLIC_URL must use HTTPS in production");
      if (!allowInsecureLocalhost && local) errors.push("NIVASA_PUBLIC_URL cannot use localhost in production");
      if (parsed.username || parsed.password) errors.push("NIVASA_PUBLIC_URL must not contain credentials");
      if (parsed.pathname !== "/" || parsed.search || parsed.hash) errors.push("NIVASA_PUBLIC_URL must contain only scheme and host");
    } catch {
      errors.push("NIVASA_PUBLIC_URL must be a valid absolute URL");
    }
  }
  const installed = options.installed ?? installationExists(env);
  if (!installed && !installTokenIsValid(env)) errors.push("A fresh production installation requires a generated NIVASA_INSTALL_TOKEN with at least 24 characters");
  return errors;
}

export function assertRuntimeEnvironment(env = process.env, options = {}) {
  const errors = runtimeValidationErrors(env, options);
  if (errors.length) throw new Error(errors.join("\n"));
}

export function normalizedRuntimeEnvironment(env = process.env) {
  const normalized = { ...env, NODE_ENV: "production" };
  if (String(normalized.RENDER || "") === "true") {
    if (!normalized.NIVASA_DB_PATH) normalized.NIVASA_DB_PATH = "/app/storage/nivasaos.sqlite";
    if (!normalized.NIVASA_UPLOAD_DIR) normalized.NIVASA_UPLOAD_DIR = "/app/storage/uploads";
    if (!normalized.NIVASA_BACKUP_DIR) normalized.NIVASA_BACKUP_DIR = "/app/storage/backups";
  }
  const publicUrl = configuredPublicUrl(normalized);
  if (publicUrl && !normalized.NIVASA_PUBLIC_URL) normalized.NIVASA_PUBLIC_URL = publicUrl;
  if (publicUrl && !normalized.NEXT_PUBLIC_APP_URL) normalized.NEXT_PUBLIC_APP_URL = publicUrl;
  return normalized;
}
