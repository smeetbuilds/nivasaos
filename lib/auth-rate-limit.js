import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { get, run, transaction } from "@/lib/db";

const POLICIES = Object.freeze({
  account: { limit: 40, windowMs: 60 * 60 * 1000, lockMs: 15 * 60 * 1000 },
  network: { limit: 20, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 }
});

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function normalizedIdentifier(value) {
  return String(value || "").trim().toLowerCase().slice(0, 320) || "missing";
}

async function trustedClientAddress() {
  if (String(process.env.NIVASA_TRUST_PROXY_HEADERS || "") !== "1") return null;
  const store = await headers();
  const address = String(store.get("x-nivasa-client-ip") || "").trim();
  return isIP(address) ? address : null;
}

export async function loginThrottleContext(realm, identifier) {
  const normalizedRealm = String(realm || "login").slice(0, 40);
  const normalizedAccount = normalizedIdentifier(identifier);
  const context = [
    { keyHash: digest(`${normalizedRealm}:account:${normalizedAccount}`), realm: normalizedRealm, dimension: "account", ...POLICIES.account }
  ];
  const network = await trustedClientAddress();
  if (network) {
    context.push({ keyHash: digest(`${normalizedRealm}:network:${network}`), realm: normalizedRealm, dimension: "network", ...POLICIES.network });
  }
  return context;
}

export function throttleRetryAfter(context, now = Date.now()) {
  let retryAfter = 0;
  for (const item of context) {
    const row = get("SELECT locked_until FROM auth_rate_limits WHERE key_hash=$keyHash", { keyHash: item.keyHash });
    const lockedUntil = row?.locked_until ? new Date(row.locked_until).getTime() : 0;
    if (Number.isFinite(lockedUntil) && lockedUntil > now) retryAfter = Math.max(retryAfter, Math.ceil((lockedUntil - now) / 1000));
  }
  return retryAfter;
}

export function recordAuthFailure(context, now = new Date()) {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  transaction(() => {
    for (const item of context) {
      const row = get("SELECT failed_attempts,window_started,locked_until FROM auth_rate_limits WHERE key_hash=$keyHash", { keyHash: item.keyHash });
      const windowStarted = row?.window_started ? new Date(row.window_started).getTime() : 0;
      const resetWindow = !Number.isFinite(windowStarted) || windowStarted <= nowMs - item.windowMs;
      const nextFailures = resetWindow ? 1 : Number(row?.failed_attempts || 0) + 1;
      const currentLock = row?.locked_until ? new Date(row.locked_until).getTime() : 0;
      const lockUntil = nextFailures >= item.limit
        ? new Date(nowMs + item.lockMs).toISOString()
        : (Number.isFinite(currentLock) && currentLock > nowMs ? row.locked_until : null);
      run(
        `INSERT INTO auth_rate_limits (key_hash,realm,dimension,failed_attempts,window_started,locked_until,updated_at)
         VALUES ($keyHash,$realm,$dimension,$failedAttempts,$windowStarted,$lockedUntil,CURRENT_TIMESTAMP)
         ON CONFLICT(key_hash) DO UPDATE SET realm=excluded.realm,dimension=excluded.dimension,
         failed_attempts=excluded.failed_attempts,window_started=excluded.window_started,
         locked_until=excluded.locked_until,updated_at=CURRENT_TIMESTAMP`,
        {
          keyHash: item.keyHash,
          realm: item.realm,
          dimension: item.dimension,
          failedAttempts: nextFailures,
          windowStarted: resetWindow ? nowIso : row.window_started,
          lockedUntil: lockUntil
        }
      );
    }
    run("DELETE FROM auth_rate_limits WHERE updated_at < datetime('now','-2 days')");
  });
}

export function clearAccountThrottle(context) {
  const account = context.find((item) => item.dimension === "account");
  if (account) run("DELETE FROM auth_rate_limits WHERE key_hash=$keyHash", { keyHash: account.keyHash });
}
