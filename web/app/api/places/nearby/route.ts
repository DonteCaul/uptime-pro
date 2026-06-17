import { type NextRequest, NextResponse } from "next/server";
import { readPlacesCache, writePlacesCache } from "@/lib/cache/db-cache";

/**
 * Google Places (New) proxy — runs server-side so the API key never reaches
 * the browser. Caches results in Postgres (30-day TTL) keyed by lat/lon
 * bucket + query, since dropzone lists rarely change. This is the PAID API,
 * so caching is critical for cost control.
 *
 * Mirrors the original backend logic: runs three queries ("skydiving",
 * "parachute center", "skydive") and dedupes by place ID.
 *
 *   GET /api/places/nearby?lat=...&lon=...&radius=16093
 *
 * Returns: { places: [{ lat, lon, name }] }
 */
const QUERIES = ["skydiving", "parachute center", "skydive"];
const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = process.env.GOOGLE_PLACES_KEY;
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const radius = parseInt(searchParams.get("radius") ?? "16093"); // 10 miles

  if (!key) {
    return NextResponse.json(
      { error: "Google Places key not configured" },
      { status: 503 },
    );
  }
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "lat and lon required" }, { status: 400 });
  }

  // Cache lookup uses a combined key across all three queries.
  const combinedCacheKey = QUERIES.join("|");
  const cached = await readPlacesCache<PlacesResult>(
    lat,
    lon,
    combinedCacheKey,
    TTL_MS,
  );
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const seen = new Set<string>();
    const places: PlaceSummary[] = [];

    // Run the three searches sequentially (Google Places rate-limits bursts).
    for (const query of QUERIES) {
      const body = {
        textQuery: query,
        locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius } },
        pageSize: 10,
        languageCode: "en",
      };
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "places.displayName,places.location",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(`[places] query "${query}" failed: ${res.status}`);
        continue;
      }
      const data = await res.json();
      for (const p of data.places ?? []) {
        const placeKey = `${p.location?.latitude?.toFixed(4)},${p.location?.longitude?.toFixed(4)}`;
        if (seen.has(placeKey)) continue;
        seen.add(placeKey);
        places.push({
          lat: p.location?.latitude,
          lon: p.location?.longitude,
          name: p.displayName?.text,
        });
      }
    }

    const result: PlacesResult = { places };
    await writePlacesCache(lat, lon, combinedCacheKey, result);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Places lookup failed" },
      { status: 500 },
    );
  }
}

interface PlaceSummary {
  lat: number | undefined;
  lon: number | undefined;
  name: string | undefined;
}
interface PlacesResult {
  places: PlaceSummary[];
}
