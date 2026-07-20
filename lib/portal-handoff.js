import "server-only";
import { Buffer } from "node:buffer";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { get, run } from "@/lib/db";

export const PORTAL_HANDOFF_COOKIE = "nivasa_portal_invite_handoff";
export const PORTAL_HANDOFF_MAX_AGE_SECONDS = 5 * 60;
const HANDOFF_SECRET_SETTING = "portal_handoff_secret";

function handoffSecret() {
  const existing = String(get("SELECT value FROM settings WHERE key=$key", { key: HANDOFF_SECRET_SETTING })?.value || "");
  if (/^[A-Za-z0-9_-]{40,}$/.test(existing)) return existing;
  const generated = randomBytes(32).toString("base64url");
  run(
    "INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES ($key,$value,CURRENT_TIMESTAMP)",
    { key: HANDOFF_SECRET_SETTING, value: generated }
  );
  const stored = String(get("SELECT value FROM settings WHERE key=$key", { key: HANDOFF_SECRET_SETTING })?.value || "");
  if (!/^[A-Za-z0-9_-]{40,}$/.test(stored)) throw new Error("Portal handoff signing secret could not be initialized");
  return stored;
}

function signature(payload) {
  return createHmac("sha256", handoffSecret()).update(payload).digest("base64url");
}

function signaturesMatch(actual, expected) {
  const actualBytes = Buffer.from(String(actual || ""), "base64url");
  const expectedBytes = Buffer.from(String(expected || ""), "base64url");
  return actualBytes.length === expectedBytes.length && actualBytes.length > 0 && timingSafeEqual(actualBytes, expectedBytes);
}

export function encodePortalInviteHandoff({ token, tenantId, createdAt = Date.now() }) {
  const payload = Buffer.from(JSON.stringify({ token, tenantId: Number(tenantId), createdAt }), "utf8").toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function readPortalInviteHandoff(value, now = Date.now()) {
  try {
    const [payload, suppliedSignature, extra] = String(value || "").split(".");
    if (!payload || !suppliedSignature || extra !== undefined || !signaturesMatch(suppliedSignature, signature(payload))) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const tenantId = Number(parsed.tenantId);
    const createdAt = Number(parsed.createdAt);
    const token = String(parsed.token || "");
    if (!Number.isInteger(tenantId) || tenantId <= 0) return null;
    if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) return null;
    if (!Number.isFinite(createdAt) || createdAt > now + 30000 || now - createdAt > PORTAL_HANDOFF_MAX_AGE_SECONDS * 1000) return null;
    return { tenantId, token };
  } catch {
    return null;
  }
}

export function portalHandoffCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/tenant-portal",
    maxAge: PORTAL_HANDOFF_MAX_AGE_SECONDS,
    priority: "high"
  };
}
