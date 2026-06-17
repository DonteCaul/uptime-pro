import { type NextRequest, NextResponse } from "next/server";
import { readCache, writeCache } from "@/lib/cache/db-cache";
import { fetchWeather, type WeatherSummary } from "@/lib/weather";

/**
 * Open-Meteo weather proxy — moves the previously browser-direct calls
 * server-side and caches results in Postgres.
 *
 * Historical weather is immutable, so we cache indefinitely. Recent forecasts
 * (within 6 days) use a 10-minute TTL since the underlying forecast can shift.
 *
 *   GET /api/weather?lat=...&lon=...&at=<iso-timestamp>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const at = searchParams.get("at");

  if (Number.isNaN(lat) || Number.isNaN(lon) || !at) {
    return NextResponse.json(
      { error: "lat, lon, and at (ISO timestamp) are required" },
      { status: 400 },
    );
  }

  // Cache key: lat/lon to 2 decimals (~1km) + the calendar date.
  const date = new Date(at).toISOString().slice(0, 10);
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${date}`;

  // Historical (>6 days ago) is immutable — cache forever. Recent: 10 min.
  const jumpDate = new Date(at);
  const daysDiff = (Date.now() - jumpDate.getTime()) / 86_400_000;
  const ttlMs =
    daysDiff < 6
      ? 1000 * 60 * 10 // 10 minutes
      : Number.MAX_SAFE_INTEGER; // effectively forever

  const cached = await readCache<WeatherSummary>("weather_cache", key, ttlMs);
  if (cached) {
    return NextResponse.json(cached);
  }

  const weather = await fetchWeather(lat, lon, at);
  if (!weather) {
    return NextResponse.json(
      { error: "Weather data unavailable" },
      { status: 502 },
    );
  }

  await writeCache("weather_cache", key, weather);
  return NextResponse.json(weather);
}
