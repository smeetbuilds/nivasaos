import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { get, run, scalar } from "@/lib/db";

const COOKIE = "nivasa_session";
const SESSION_DAYS = 14;

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algorithm, salt, hash] = stored.split(":");
    if (algorithm !== "scrypt" || !salt || !hash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  } catch {
    return false;
  }
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  run(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($userId, $hash, $expires)",
    { userId, hash: tokenHash(token), expires: expires.toISOString() }
  );
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token_hash = $hash", { hash: tokenHash(token) });
  store.delete(COOKIE);
}

export async function currentUser() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  return get(
    `SELECT u.id, u.name, u.email, u.role, u.status
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $hash AND s.expires_at > $now AND u.status = 'active'`,
    { hash: tokenHash(token), now: new Date().toISOString() }
  );
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(roles) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard?error=forbidden");
  return user;
}

export function isInstalled() {
  return Number(scalar("SELECT COUNT(*) FROM users WHERE role = 'owner'")) > 0;
}

export function propertyScopeSql(user, alias = "p") {
  if (user.role === "owner") return { clause: "1=1", params: {} };
  return {
    clause: `${alias}.id IN (SELECT property_id FROM user_properties WHERE user_id = $scopeUserId)`,
    params: { scopeUserId: user.id }
  };
}

export function canAccessProperty(user, propertyId) {
  if (user.role === "owner") return true;
  return Boolean(get(
    "SELECT 1 FROM user_properties WHERE user_id = $userId AND property_id = $propertyId",
    { userId: user.id, propertyId: Number(propertyId) }
  ));
}
