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

/**
 * Feature-flag guard. Every /v1 route handler calls this first and returns 404
 * if compat is disabled. Read from env per-request (no global state — safe for
 * serverless).
 */
export function isDekunuCompatEnabled(): boolean {
  return process.env.DEKUNU_COMPAT === "true";
}
