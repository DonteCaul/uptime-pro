import { type NextRequest, NextResponse } from "next/server";
import { readCache, writeCache } from "@/lib/cache/db-cache";

/**
 * Mapbox geocoding proxy — runs server-side so the token never reaches the
 * browser, and caches results in Postgres (90-day TTL) since place names
 * rarely change.
 *
 * Supports two modes via query params:
 *   - Reverse geocode:  ?lat=...&lon=...
 *   - Forward geocode:  ?q=<address>
 *
 * Returns a normalized { name: string | null, raw: <mapbox response> }.
 */
const MAPBOX_BASE = "https://api.mapbox.com/geocoding/v5/mapbox.places";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Mapbox token not configured" },
      { status: 503 },
    );
  }

  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const q = searchParams.get("q");

  if (!lat || !lon) {
    if (!q) {
      return NextResponse.json(
        { error: "Provide lat/lon or q" },
        { status: 400 },
      );
    }
  }

  // Build the cache key and Mapbox endpoint.
  let endpoint: string;
  let cacheKey: string;
  if (lat && lon) {
    // Reverse geocode: lon,lat order per Mapbox spec.
    endpoint = `${MAPBOX_BASE}/${lon},${lat}.json?types=place,locality&limit=1&access_token=${token}`;
    cacheKey = `${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}`;
  } else {
    endpoint = `${MAPBOX_BASE}/${encodeURIComponent(q!)}.json?types=place,locality,address&limit=1&access_token=${token}`;
    cacheKey = `fwd:${q}`;
  }

  // 90-day TTL — place names are stable.
  const TTL = 1000 * 60 * 60 * 24 * 90;
  const cached = await readCache<GeocodeResult>("geocode_cache", cacheKey, TTL);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(endpoint);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Mapbox error: ${res.status}` },
        { status: 502 },
      );
    }
    const raw = await res.json();
    const placeName = raw?.features?.[0]?.place_name;
    // Trim to first two components for a clean label (e.g. "Lodi, CA").
    const name = placeName
      ? placeName.split(",").slice(0, 2).join(",").trim()
      : null;

    const result: GeocodeResult = { name, raw };
    await writeCache("geocode_cache", cacheKey, result);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Geocode failed" },
      { status: 500 },
    );
  }
}

interface GeocodeResult {
  name: string | null;
  raw: unknown;
}
