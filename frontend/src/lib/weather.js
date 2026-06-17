const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
// historical-forecast-api has pressure-level wind data; archive-api does not
const ARCHIVE_BASE  = 'https://historical-forecast-api.open-meteo.com/v1/forecast';

const HOURLY_VARS = [
  'temperature_2m',
  'windspeed_10m', 'winddirection_10m', 'windgusts_10m',
  'cloudcover', 'precipitation',
  'windspeed_850hPa', 'winddirection_850hPa',   // ~5,000 ft
  'windspeed_700hPa', 'winddirection_700hPa',   // ~10,000 ft
  'windspeed_600hPa', 'winddirection_600hPa',   // ~14,000 ft
  'windspeed_500hPa', 'winddirection_500hPa',   // ~18,000 ft
].join(',');

const DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

function cardinalDir(deg) {
  if (deg == null) return null;
  return DIRS[Math.round(deg / 22.5) % 16];
}

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

export async function fetchWeather(lat, lon, isoTimestamp) {
  if (!lat || !lon || !isoTimestamp) return null;

  const jumpDate  = new Date(isoTimestamp);
  const daysDiff  = (Date.now() - jumpDate.getTime()) / 86_400_000;
  const dateParam = dateStr(jumpDate);

  const url = daysDiff < 6
    ? `${FORECAST_BASE}?latitude=${lat}&longitude=${lon}&hourly=${HOURLY_VARS}&past_days=7&forecast_days=1&timezone=auto`
    : `${ARCHIVE_BASE}?latitude=${lat}&longitude=${lon}&start_date=${dateParam}&end_date=${dateParam}&hourly=${HOURLY_VARS}&timezone=auto`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const times = data.hourly?.time ?? [];
    const jumpHour = jumpDate.toISOString().slice(0, 13);
    let idx = times.findIndex(t => t.startsWith(jumpHour));
    if (idx < 0) idx = 0;

    const get = key => data.hourly?.[key]?.[idx] ?? null;

    return {
      temp_c:       get('temperature_2m'),
      wind_kph:     get('windspeed_10m'),
      wind_dir_deg: get('winddirection_10m'),
      wind_dir:     cardinalDir(get('winddirection_10m')),
      gusts_kph:    get('windgusts_10m'),
      cloud_pct:    get('cloudcover'),
      precip_mm:    get('precipitation'),

      // ~5,000 ft (850 hPa)
      w850_kph:     get('windspeed_850hPa'),
      w850_dir_deg: get('winddirection_850hPa'),
      w850_dir:     cardinalDir(get('winddirection_850hPa')),

      // ~10,000 ft (700 hPa)
      w700_kph:     get('windspeed_700hPa'),
      w700_dir_deg: get('winddirection_700hPa'),
      w700_dir:     cardinalDir(get('winddirection_700hPa')),

      // ~14,000 ft (600 hPa)
      w600_kph:     get('windspeed_600hPa'),
      w600_dir_deg: get('winddirection_600hPa'),
      w600_dir:     cardinalDir(get('winddirection_600hPa')),
    };
  } catch {
    return null;
  }
}
