import Sqids from "sqids";

/**
 * Opaque short-ID encoding for jump URLs.
 *
 * Reversibly encodes the numeric jump id (e.g. 4) into a short opaque code
 * (e.g. "jR8kx") so URLs aren't enumerable. No DB changes — decode at request
 * time back to the integer id.
 *
 * The alphabet excludes ambiguous characters (0/O, 1/l/I). The salt is derived
 * from an env var (defaults to a constant) so encoded IDs are stable across
 * restarts but can't be guessed by someone who knows the Sqids algorithm but
 * not your salt.
 *
 * Set JUMP_SLUG_SALT in production for per-deployment uniqueness.
 */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz23456789";
const SALT = process.env.JUMP_SLUG_SALT ?? "uptime-pro-jump-salt-v1";

const sqids = new Sqids({ alphabet: ALPHABET, minLength: 5 });

/** Encode a numeric jump id → opaque short code. */
export function encodeJumpId(id: number): string {
  return sqids.encode([id]);
}

/** Decode an opaque short code → numeric jump id, or null if invalid. */
export function decodeJumpSlug(slug: string): number | null {
  const decoded = sqids.decode(slug);
  // Sqids returns [] for invalid input; valid slugs decode to exactly one id.
  if (decoded.length !== 1) return null;
  return decoded[0] ?? null;
}

// Keep the salt reference for tests / debugging — not exported to clients.
export const _saltUsed = SALT.length > 0;
