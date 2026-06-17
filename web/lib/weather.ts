/**
 * Open-Meteo weather client (ported from the original Vite app).
 *
 * Pure logic — no caching here. The /api/weather route handler wraps this
 * with the Postgres cache layer.
 */
const FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";
// historical-forecast-api has pressure-level wind data; archive-api does not
const ARCHIVE_BASE =
  "https://historical-forecast-api.open-meteo.com/v1/forecast";

const HOURLY_VARS = [
  "temperature_2m",
  "windspeed_10m",
  "winddirection_10m",
  "windgusts_10m",
  "cloudcover",
  "precipitation",
  "windspeed_850hPa",
  "winddirection_850hPa", // ~5,000 ft
  "windspeed_700hPa",
  "winddirection_700hPa", // ~10,000 ft
  "windspeed_600hPa",
  "winddirection_600hPa", // ~14,000 ft
  "windspeed_500hPa",
  "winddirection_500hPa", // ~18,000 ft
].join(",");

const DIRS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

function cardinalDir(deg: number | null): string | null {
  if (deg == null) return null;
  return DIRS[Math.round(deg / 22.5) % 16]!;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface WeatherSummary {
  temp_c: number | null;
  wind_kph: number | null;
  wind_dir_deg: number | null;
  wind_dir: string | null;
  gusts_kph: number | null;
  cloud_pct: number | null;
  precip_mm: number | null;
  w850_kph: number | null;
  w850_dir_deg: number | null;
  w850_dir: string | null;
  w700_kph: number | null;
  w700_dir_deg: number | null;
  w700_dir: string | null;
  w600_kph: number | null;
  w600_dir_deg: number | null;
  w600_dir: string | null;
}

/**
 * Fetch weather for a specific lat/lon at the given ISO timestamp.
 * Returns null on any failure (mirrors original behavior).
 */
export async function fetchWeather(
  lat: number,
  lon: number,
  isoTimestamp: string,
): Promise<WeatherSummary | null> {
  const jumpDate = new Date(isoTimestamp);
  const daysDiff = (Date.now() - jumpDate.getTime()) / 86_400_000;
  const dateParam = dateStr(jumpDate);

  const url =
    daysDiff < 6
      ? `${FORECAST_BASE}?latitude=${lat}&longitude=${lon}&hourly=${HOURLY_VARS}&past_days=7&forecast_days=1&timezone=auto`
      : `${ARCHIVE_BASE}?latitude=${lat}&longitude=${lon}&start_date=${dateParam}&end_date=${dateParam}&hourly=${HOURLY_VARS}&timezone=auto`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const times: string[] = data.hourly?.time ?? [];
    const jumpHour = jumpDate.toISOString().slice(0, 13);
    let idx = times.findIndex((t) => t.startsWith(jumpHour));
    if (idx < 0) idx = 0;

    const get = (key: string): number | null =>
      data.hourly?.[key]?.[idx] ?? null;

    return {
      temp_c: get("temperature_2m"),
      wind_kph: get("windspeed_10m"),
      wind_dir_deg: get("winddirection_10m"),
      wind_dir: cardinalDir(get("winddirection_10m")),
      gusts_kph: get("windgusts_10m"),
      cloud_pct: get("cloudcover"),
      precip_mm: get("precipitation"),
      w850_kph: get("windspeed_850hPa"),
      w850_dir_deg: get("winddirection_850hPa"),
      w850_dir: cardinalDir(get("winddirection_850hPa")),
      w700_kph: get("windspeed_700hPa"),
      w700_dir_deg: get("winddirection_700hPa"),
      w700_dir: cardinalDir(get("winddirection_700hPa")),
      w600_kph: get("windspeed_600hPa"),
      w600_dir_deg: get("winddirection_600hPa"),
      w600_dir: cardinalDir(get("winddirection_600hPa")),
    };
  } catch {
    return null;
  }
}
