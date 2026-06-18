import jwt from "jsonwebtoken";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Dekunu device-compat helpers.
 *
 * The device layer uses its OWN JWT scheme (separate from Supabase Auth) because
 * the hardware protocol is fixed — we can't change what the device sends. Tokens
 * are HS256, signed with DEKUNU_JWT_SECRET, payload { userId, deviceId }, 7-day
 * expiry. `userId` here is the Dekunu numeric user id (profiles.uptime_user_id),
 * NOT the Supabase auth uid.
 */

const ALG = "HS256";
const EXPIRY = "7d";

function secret(): string {
  const s = process.env.DEKUNU_JWT_SECRET;
  if (!s) throw new Error("DEKUNU_JWT_SECRET is not set");
  return s;
}

// ---------------------------------------------------------------------------
// Dekunu compat feature flag — cached from app_settings table.
// ---------------------------------------------------------------------------
let _compatCache: { enabled: boolean; fetchedAt: number } | null = null;
const COMPAT_TTL_MS = 30_000; // refresh every 30 seconds

/**
 * Fetch the current `dekunu_compat` setting from app_settings. Results are
 * cached for 30 seconds to avoid hammering Supabase on every /v1 request.
 */
async function fetchCompatFlag(): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "dekunu_compat")
      .maybeSingle();
    return data?.value === "true";
  } catch {
    // If the table doesn't exist yet or the query fails, fall back to env var.
    return process.env.DEKUNU_COMPAT === "true";
  }
}

/**
 * Invalidate the compat cache (called after admin toggles the setting).
 */
export async function invalidateCompatCache(): Promise<void> {
  _compatCache = null;
}

/**
 * Feature-flag guard. Every /v1 route handler calls this first and returns 404
 * if compat is disabled. Synchronous — reads from a 30-second TTL cache so we
 * don't need to change all route handlers to async for this check.
 *
 * Falls back to the DEKUNU_COMPAT env var if the app_settings table is missing.
 */
export function isDekunuCompatEnabled(): boolean {
  if (_compatCache && Date.now() - _compatCache.fetchedAt < COMPAT_TTL_MS) {
    return _compatCache.enabled;
  }
  // Fire-and-forget refresh — return current cached value (or fallback).
  // The next request after the cache populates will pick up the new value.
  void fetchCompatFlag().then((enabled) => {
    _compatCache = { enabled, fetchedAt: Date.now() };
  });
  // While the cache is cold, fall back to the last known value or env var.
  return _compatCache?.enabled ?? process.env.DEKUNU_COMPAT === "true";
}

export interface DekunuTokenPayload {
  userId: number;
  deviceId: number;
}

export function makeDekunuToken(userId: number, deviceId: number): string {
  return jwt.sign({ userId, deviceId }, secret(), {
    expiresIn: EXPIRY,
    algorithm: ALG,
  });
}

export function verifyDekunuToken(token: string): DekunuTokenPayload | null {
  try {
    return jwt.verify(token, secret()) as DekunuTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Resolve a Dekunu numeric user id → Supabase profile + auth uid.
 * Returns null if no profile has that uptime_user_id.
 */
export async function findUserByDekunuId(
  dekunuUserId: number,
): Promise<{ id: string; uptimeUserId: number; fullName: string | null; email: string | null } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, uptime_user_id, full_name, email")
    .eq("uptime_user_id", dekunuUserId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id as string,
    uptimeUserId: data.uptime_user_id as number,
    fullName: data.full_name as string | null,
    email: data.email as string | null,
  };
}
