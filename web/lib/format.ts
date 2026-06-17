/**
 * Shared formatting helpers — kept pure so they're easy to unit-test.
 */

/** Format a duration in seconds as "1m 23s" or "45s". Null → null. */
export function fmtDuration(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
