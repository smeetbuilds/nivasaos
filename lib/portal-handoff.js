import "server-only";
import { Buffer } from "node:buffer";

export const PORTAL_HANDOFF_COOKIE = "nivasa_portal_invite_handoff";
export const PORTAL_HANDOFF_MAX_AGE_SECONDS = 5 * 60;

export function encodePortalInviteHandoff({ token, tenantId, createdAt = Date.now() }) {
  return Buffer.from(JSON.stringify({ token, tenantId: Number(tenantId), createdAt }), "utf8").toString("base64url");
}

export function readPortalInviteHandoff(value, now = Date.now()) {
  try {
    const parsed = JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
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
