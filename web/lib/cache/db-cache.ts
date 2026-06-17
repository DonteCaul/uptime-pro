import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Postgres-backed cache for expensive external API responses.
 *
 * Three cache tables (defined in migration 0001):
 *   - places_cache   (Google Places results, keyed by lat/lon bucket + query)
 *   - geocode_cache  (Mapbox geocoding, keyed by query or "lat,lon")
 *   - weather_cache  (Open-Meteo, keyed by "lat,lon,YYYY-MM-DD")
 *
 * All writes use the service-role admin client (bypasses RLS). Reads can use
 * the user's session client (RLS allows authenticated reads — see migration 0002).
 */

/** Default TTL in milliseconds. */
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

interface CacheRow {
  response_json: string;
  fetched_at: string;
}

/**
 * Read a cached JSON value. Returns null if missing or stale.
 *
 * `table` must be one of: geocode_cache, weather_cache.
 */
export async function readCache<T>(
  table: "geocode_cache" | "weather_cache",
  key: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(table)
    .select("response_json, fetched_at")
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as CacheRow;
  const age = Date.now() - new Date(row.fetched_at).getTime();
  if (age > ttlMs) return null;

  try {
    return JSON.parse(row.response_json) as T;
  } catch {
    return null;
  }
}

/**
 * Write a value to the cache, upserting on key conflict.
 */
export async function writeCache(
  table: "geocode_cache" | "weather_cache",
  key: string,
  value: unknown,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from(table)
    .upsert(
      { key, response_json: JSON.stringify(value), fetched_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) {
    // Non-fatal — log and continue. The caller still has the live value.
    console.warn(`[cache] write to ${table} failed: ${error.message}`);
  }
}

/**
 * Places cache uses a composite key (lat_bucket, lon_bucket, query), so it has
 * its own read/write helpers.
 */
export async function readPlacesCache<T>(
  lat: number,
  lon: number,
  query: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("places_cache")
    .select("response_json, fetched_at")
    .eq("lat_bucket", bucket(lat))
    .eq("lon_bucket", bucket(lon))
    .eq("query", query)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as CacheRow;
  const age = Date.now() - new Date(row.fetched_at).getTime();
  if (age > ttlMs) return null;

  try {
    return JSON.parse(row.response_json) as T;
  } catch {
    return null;
  }
}

export async function writePlacesCache(
  lat: number,
  lon: number,
  query: string,
  value: unknown,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("places_cache").upsert(
    {
      lat_bucket: bucket(lat),
      lon_bucket: bucket(lon),
      query,
      response_json: JSON.stringify(value),
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "lat_bucket,lon_bucket,query" },
  );
  if (error) {
    console.warn(`[cache] write to places_cache failed: ${error.message}`);
  }
}

/** Round to a 3-decimal bucket (~111m granularity) for cache keying. */
function bucket(value: number): number {
  return Math.round(value * 1000);
}
