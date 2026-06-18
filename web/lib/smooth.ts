/**
 * Telemetry smoothing utilities.
 *
 * Applied client-side at render time so the raw DB data stays untouched.
 * The main entry point is `smoothTrack()` which applies median filtering
 * and per-phase spike clamping to a TrackPoint array.
 */

// ---------------------------------------------------------------------------
// TrackPoint shape — mirrors the interface in JumpDetailClient.tsx
// ---------------------------------------------------------------------------
export interface TrackPoint {
  sample_ms: number | null;
  device_mode: number | null;
  gps_lat: number | null;
  gps_lon: number | null;
  gps_altitude_m: number | null;
  altitude_m: number | null;
  altitude_above_ground_m: number | null;
  inst_vert_speed_ms: number | null;
  gps_speed_knot: number | null;
  gps_angle_deg: number | null;
  accel_x: number | string | null;
  accel_y: number | string | null;
  accel_z: number | string | null;
  temperature_c: number | null;
  batt_perc: number | null;
}

// ---------------------------------------------------------------------------
// Median filter
// ---------------------------------------------------------------------------

/**
 * Apply a median filter to an array of numbers.
 *
 * For each element, gathers `halfWindow` samples on each side plus the center
 * (total window = 2 * halfWindow + 1), sorts them, and picks the median.
 * Clamped at array boundaries (shrinking window near edges).
 */
export function medianFilter(values: number[], halfWindow: number): number[] {
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - halfWindow);
    const hi = Math.min(values.length - 1, i + halfWindow);
    const win: number[] = [];
    for (let j = lo; j <= hi; j++) win.push(values[j]);
    win.sort((a, b) => a - b);
    out[i] = win[Math.floor(win.length / 2)];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-phase vertical speed limits (m/s)
// ---------------------------------------------------------------------------

/** DeviceMode → max absolute vertical speed considered physically valid. */
const PHASE_VERT_SPEED_LIMITS: Record<number, number> = {
  2: 20,   // climb — aircraft ascent, ~10 m/s max
  3: 120,  // freefall — terminal ~60 m/s, allow margin for noise
  4: 25,   // canopy — steady descent ~5 m/s, allow margin
  5: 5,    // ground — basically zero
};

function clampVertSpeed(mode: number | null, raw: number, smoothed: number): number {
  const limit = PHASE_VERT_SPEED_LIMITS[mode ?? -1];
  // If we don't know the phase or have no limit, use the smoothed value as-is.
  if (limit == null) return smoothed;
  // If the raw value exceeds the physically plausible range for this phase,
  // replace it with the median-filtered value.
  return Math.abs(raw) > limit ? smoothed : raw;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

const HALF_WINDOW = 4; // window-9 median filter (4 on each side + center)

/**
 * Smooth a track array for display. Returns a new array — does not mutate input.
 *
 * Pipeline:
 *  1. Median-filter vertical speed (window-9)
 *  2. Median-filter altitude AGL (window-9)
 *  3. Per-phase spike clamp on vertical speed
 */
export function smoothTrack(track: TrackPoint[]): TrackPoint[] {
  const N = track.length;
  if (N === 0) return track;

  // 1. Extract raw vertical speeds, apply median filter.
  const rawVS = track.map((p) => p.inst_vert_speed_ms ?? 0);
  const filteredVS = medianFilter(rawVS, HALF_WINDOW);

  // 2. Extract raw altitude AGL, apply median filter.
  const rawAGL = track.map((p) => p.altitude_above_ground_m ?? p.altitude_m ?? 0);
  const filteredAGL = medianFilter(rawAGL, HALF_WINDOW);

  // 3. Build output with clamped vertical speed and smoothed altitude.
  return track.map((pt, i) => ({
    ...pt,
    altitude_above_ground_m: pt.altitude_above_ground_m != null
      ? filteredAGL[i]
      : pt.altitude_above_ground_m,
    inst_vert_speed_ms: pt.inst_vert_speed_ms != null
      ? clampVertSpeed(pt.device_mode, pt.inst_vert_speed_ms, filteredVS[i])
      : pt.inst_vert_speed_ms,
  }));
}
