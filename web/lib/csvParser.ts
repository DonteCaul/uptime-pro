import { parse } from "csv-parse/sync";

/**
 * Parse a UpTime.Pro jump log CSV buffer.
 *
 * Returns { meta, rows } where `meta` is the aggregated jump summary and
 * `rows` are the per-sample sensor points ready for bulk insert.
 *
 * This is the CSV-only fallback path used when no summary JSON is available
 * (e.g. device WiFi sync). When a summary JSON IS available, prefer
 * parseSummaryJSON() for meta accuracy — the CSV bugs below only affect
 * this fallback.
 *
 * UpTime.Pro firmware quirks preserved:
 *  - `<` / `>` overflow markers (e.g. "<0.07") are stripped before numeric cast
 *  - gpsLat/gpsLon are stored ×1e6 in the CSV; divided out here
 *  - DeviceMode: 2=climb, 3=freefall, 4=canopy, 5=ground
 */

export interface JumpMeta {
  jumped_at: string | null;
  exit_altitude_m: number;
  deployment_altitude_m: number | null;
  freefall_duration_s: number | null;
  max_freefall_speed_ms: number;
  canopy_duration_s: number | null;
  climb_duration_s: number | null;
  exit_lat: number | null;
  exit_lon: number | null;
  landing_lat: number | null;
  landing_lon: number | null;
  dz_lat: number | null;
  dz_lon: number | null;
  row_count: number;
  // Fields populated from summary JSON only (not derivable from CSV).
  jump_number?: number;
  discipline_from_summary?: string;
  // Analysis fields from summary JSON — override compute_jump_analysis results
  // when available (firmware-smoothed values are more accurate than raw sensor).
  avg_freefall_speed_ms?: number | null;
  opening_peak_g?: number | null;
}

export interface SensorRow {
  sample_ms: number | null;
  device_mode: number | null;
  gps_time: number | null;
  gps_lat: number | null;
  gps_lon: number | null;
  gps_altitude_m: number | null;
  gps_speed_knot: number | null;
  gps_angle_deg: number | null;
  gps_sats: number | null;
  pressure_pa: number | null;
  temperature_c: number | null;
  altitude_m: number | null;
  altitude_above_ground_m: number | null;
  ground_level_m: number | null;
  inst_vert_speed_ms: number | null;
  compass_angle: number | null;
  accel_x: number | null;
  accel_y: number | null;
  accel_z: number | null;
  gyro_x: number | null;
  gyro_y: number | null;
  gyro_z: number | null;
  batt_perc: number | null;
  pressure_pa_baro2: number | null;
  temperature_c_baro2: number | null;
  altitude_m_baro2: number | null;
}

interface ParsedRecord {
  Timestamp: number | null;
  DeviceMode: number | null;
  gpsTime: number | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAltitudeMeters: number | null;
  gpsSpeedKnot: number | null;
  gpsAngleDegree: number | null;
  gpsNumOfSats: number | null;
  pressurePa: number | null;
  temperatureC: number | null;
  altitudeMeters: number | null;
  altitudeAboveGroundMeters: number | null;
  groundLevelMeters: number | null;
  instVertSpeedMetersPerSec: number | null;
  compasAngle: number | null;
  accelX: number | null;
  accelY: number | null;
  accelZ: number | null;
  gyroX: number | null;
  gyroY: number | null;
  gyroZ: number | null;
  battPerc: number | null;
  pressurePaBaro2: number | null;
  temperatureCBaro2: number | null;
  altitudeMetersBaro2: number | null;
}

// ─── CSV-only parser (fallback when no summary JSON is available) ────────────

export function parseJumpCSV(buffer: Buffer | string): {
  meta: JumpMeta;
  rows: SensorRow[];
} {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    quote: false,
    relax_column_count: true,
    cast: (value: string, context) => {
      if (context.header) return value;
      // Strip firmware overflow/underflow markers (e.g. "<0.07").
      const cleaned = value.replace(/^[<>]/, "");
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    },
  }) as ParsedRecord[];

  if (!records.length) {
    return {
      meta: {
        jumped_at: null,
        exit_altitude_m: 0,
        deployment_altitude_m: null,
        freefall_duration_s: null,
        max_freefall_speed_ms: 0,
        canopy_duration_s: null,
        climb_duration_s: null,
        exit_lat: null,
        exit_lon: null,
        landing_lat: null,
        landing_lon: null,
        dz_lat: null,
        dz_lon: null,
        row_count: 0,
      },
      rows: [],
    };
  }

  const first = records[0];
  const last = records[records.length - 1];

  // Phase detection via DeviceMode transitions.
  let climbStartIdx: number | null = null;  // first Mode-2 row
  let freefallStartIdx: number | null = null;
  let freefallEndIdx: number | null = null;
  let canopyEndIdx: number | null = null;

  for (let i = 0; i < records.length; i++) {
    const mode = records[i].DeviceMode;
    if (mode === 2 && climbStartIdx === null) climbStartIdx = i;
    if (mode === 3 && freefallStartIdx === null) freefallStartIdx = i;
    if (freefallStartIdx !== null && mode !== 3 && freefallEndIdx === null) {
      freefallEndIdx = i;
    }
    // BUG FIX #4: Lock canopy end on first Mode-5 transition instead of
    // overwriting on every Mode-4 row.
    if (freefallEndIdx !== null && mode === 5 && canopyEndIdx === null) {
      canopyEndIdx = i;
    }
  }
  // Fallback: if no Mode-5 detected, canopy end is the last row.
  if (freefallEndIdx !== null && canopyEndIdx === null) {
    canopyEndIdx = records.length - 1;
  }

  // BUG FIX #1: Exit altitude = AGL at first Mode-3 row (not MSL). The CSV
  // altitudeMeters column is MSL; altitudeAboveGroundMeters is already
  // ground-relative (baro at power-on = 0 ft).
  const exitAlt = freefallStartIdx !== null
    ? (records[freefallStartIdx].altitudeAboveGroundMeters ?? 0)
    : 0;

  // BUG FIX #2: Deployment altitude = AGL ~300 rows (~1.2s at 240Hz)
  // after the mode transition. The transition row reads ~98m too low due to
  // the opening shock pressure transient.
  const DEPLOY_STABILIZE_ROWS = 300;
  const deployIdx = freefallEndIdx !== null
    ? Math.min(freefallEndIdx + DEPLOY_STABILIZE_ROWS, records.length - 1)
    : null;
  const deployAlt = deployIdx !== null
    ? (records[deployIdx].altitudeAboveGroundMeters ?? null)
    : null;

  // Exit coordinates: GPS at the exit row (first Mode-3).
  const exitRow = freefallStartIdx !== null ? records[freefallStartIdx] : first;

  // Landing coordinates: last row with valid GPS (not necessarily the very last row).
  let landingRow = last;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].gpsLatitude && records[i].gpsLongitude) {
      landingRow = records[i];
      break;
    }
  }

  // First valid GPS fix during climb phase = DZ location.
  let dzRow: ParsedRecord | null = null;
  for (const r of records) {
    if (r.DeviceMode === 2 && r.gpsLatitude && r.gpsLongitude) {
      dzRow = r;
      break;
    }
  }
  if (!dzRow) {
    for (const r of records) {
      if (r.gpsLatitude && r.gpsLongitude) {
        dzRow = r;
        break;
      }
    }
  }

  // Jumped-at timestamp from GPS wall clock (first row).
  const jumpedAt = first.gpsTime
    ? new Date(first.gpsTime * 1000).toISOString()
    : null;

  // BUG FIX #3: Durations use gpsTime (Unix seconds, wall clock) instead of
  // Timestamp (ms since boot, drifts ~+5s on freefall).
  const freefallDuration =
    freefallStartIdx !== null && freefallEndIdx !== null
      ? (records[freefallEndIdx].gpsTime ?? 0) -
        (records[freefallStartIdx].gpsTime ?? 0)
      : null;

  const canopyDuration =
    freefallEndIdx !== null && canopyEndIdx !== null
      ? (records[canopyEndIdx].gpsTime ?? 0) -
        (records[freefallEndIdx].gpsTime ?? 0)
      : null;

  const climbDuration =
    climbStartIdx !== null && freefallStartIdx !== null
      ? (records[freefallStartIdx].gpsTime ?? 0) -
        (records[climbStartIdx].gpsTime ?? 0)
      : null;

  // BUG FIX #5: Max freefall speed = true max excluding first and last 2 rows
  // of freefall (straddle mode transition transients). The 90th-percentile
  // workaround undershoots on short freefalls (hop & pop).
  let maxSpeed = 0;
  if (freefallStartIdx !== null) {
    const end = freefallEndIdx ?? records.length - 1;
    const trimmedStart = Math.min(freefallStartIdx + 2, end);
    const trimmedEnd = Math.max(end - 2, trimmedStart);
    for (let i = trimmedStart; i <= trimmedEnd; i++) {
      const v = records[i].instVertSpeedMetersPerSec;
      if (v != null && isFinite(v) && Math.abs(v) > maxSpeed) {
        maxSpeed = Math.abs(v);
      }
    }
  }

  const meta: JumpMeta = {
    jumped_at: jumpedAt,
    exit_altitude_m: exitAlt,
    deployment_altitude_m: deployAlt,
    freefall_duration_s: freefallDuration,
    max_freefall_speed_ms: maxSpeed,
    canopy_duration_s: canopyDuration,
    climb_duration_s: climbDuration,
    exit_lat: exitRow.gpsLatitude ? exitRow.gpsLatitude / 1e6 : null,
    exit_lon: exitRow.gpsLongitude ? exitRow.gpsLongitude / 1e6 : null,
    landing_lat: landingRow.gpsLatitude ? landingRow.gpsLatitude / 1e6 : null,
    landing_lon: landingRow.gpsLongitude ? landingRow.gpsLongitude / 1e6 : null,
    dz_lat: dzRow ? dzRow.gpsLatitude! / 1e6 : null,
    dz_lon: dzRow ? dzRow.gpsLongitude! / 1e6 : null,
    row_count: records.length,
  };

  const rows: SensorRow[] = records.map((r) => ({
    sample_ms: r.Timestamp,
    device_mode: r.DeviceMode,
    gps_time: r.gpsTime,
    gps_lat: r.gpsLatitude != null ? r.gpsLatitude / 1e6 : null,
    gps_lon: r.gpsLongitude != null ? r.gpsLongitude / 1e6 : null,
    gps_altitude_m: r.gpsAltitudeMeters,
    gps_speed_knot: r.gpsSpeedKnot,
    gps_angle_deg: r.gpsAngleDegree,
    gps_sats: r.gpsNumOfSats,
    pressure_pa: r.pressurePa,
    temperature_c: r.temperatureC,
    altitude_m: r.altitudeMeters,
    altitude_above_ground_m: r.altitudeAboveGroundMeters,
    ground_level_m: r.groundLevelMeters,
    inst_vert_speed_ms: r.instVertSpeedMetersPerSec,
    compass_angle: r.compasAngle,
    accel_x: r.accelX,
    accel_y: r.accelY,
    accel_z: r.accelZ,
    gyro_x: r.gyroX,
    gyro_y: r.gyroY,
    gyro_z: r.gyroZ,
    batt_perc: r.battPerc,
    pressure_pa_baro2: r.pressurePaBaro2,
    temperature_c_baro2: r.temperatureCBaro2,
    altitude_m_baro2: r.altitudeMetersBaro2,
  }));

  return { meta, rows };
}

// ─── Summary JSON parser (device-calculated, most accurate) ───────────────────

/**
 * Parse a Dekunu summary JSON object into a JumpMeta.
 *
 * The device generates this immediately after landing from the CSV data,
 * using firmware-level calculations that correct for barometric lag,
 * pressure transients, and Timestamp drift. Always prefer this over
 * the CSV-derived fallback when available.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseSummaryJSON(json: any, rowCount: number): JumpMeta {
  const m = json.moments ?? {};

  return {
    jumped_at: isoOrNone(m.takeoff?.time),
    exit_altitude_m: num(m.exit?.altitudeM) ?? 0,
    deployment_altitude_m: num(m.deployment?.altitudeM),
    freefall_duration_s: timeDiff(m.exit?.time, m.deployment?.time),
    max_freefall_speed_ms: Math.abs(num(m.freefall?.speed?.maxVert) ?? 0),
    canopy_duration_s: timeDiff(m.deployment?.time, m.landing?.time),
    climb_duration_s: timeDiff(m.takeoff?.time, m.exit?.time),
    exit_lat: parseFloatOrNull(m.exit?.lat),
    exit_lon: parseFloatOrNull(m.exit?.lon),
    landing_lat: parseFloatOrNull(m.landing?.lat),
    landing_lon: parseFloatOrNull(m.landing?.lon),
    dz_lat: parseFloatOrNull(m.takeoff?.lat),
    dz_lon: parseFloatOrNull(m.takeoff?.lon),
    row_count: rowCount,
  jump_number: num(json.customJumpNum) ?? undefined,
  discipline_from_summary: disciplineFromTypeId(json.disciplineTypeId) ?? undefined,
  // Analysis fields — firmware-smoothed values override raw-sensor calculations.
  avg_freefall_speed_ms: Math.abs(num(m.freefall?.speed?.avgVert) ?? 0) || undefined,
  opening_peak_g: num(m.deployment?.openingGForce) ?? undefined,
  };
}

function timeDiff(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const msA = Date.parse(a);
  const msB = Date.parse(b);
  if (isNaN(msA) || isNaN(msB)) return null;
  return (msB - msA) / 1000;
}

function isoOrNone(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const d = Date.parse(v);
  return isNaN(d) ? null : new Date(d).toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? null : n;
}

function parseFloatOrNull(v: unknown): number | null {
  if (!v || typeof v !== "string") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/**
 * Map Dekunu disciplineTypeId (from summary JSON) to a discipline string.
 * IDs come from the device's actionTypes.json config.
 * Falls back to null for unknown IDs.
 */
function disciplineFromTypeId(id: unknown): string | null {
  if (id == null) return null;
  const n = typeof id === "number" ? id : parseInt(id as string, 10);
  if (isNaN(n)) return null;
  const map: Record<number, string> = {
    1: "Angle",
    2: "Freefly",
    3: "FS / Flat",
    4: "Wingsuit",
    5: "Hop and Pop",
    6: "CRW",
    7: "XRW",
    1002: "Tandem",
    1003: "Speed",
    1004: "AFF Instructor",
    1006: "Classic Accuracy",
    1007: "Angle - Head Up",
    1008: "Tracking",
    1009: "AFF Video",
    1013: "Student",
    1020: "Static Line",
  };
  return map[n] ?? null;
}

// ─── Filename parsing ─────────────────────────────────────────────────────────
// Dekunu filenames: action_<userId>_<YYYYMMDD>_<HHMM>-<sampleRateHz>.csv
// The number after the dash is the sample rate (240 or 300), NOT a discipline.
// Discipline is determined ONLY from the summary JSON's disciplineTypeId.

export interface ParsedFilename {
  userId: number | null;
  sampleRateHz: number | null;
}

export function parseFilename(filename: string): ParsedFilename {
  const match = filename.match(/action_(\d+)_(\d{8})_(\d{4})-(\d+)/);
  const userId = match ? parseInt(match[1], 10) : null;
  const sampleRateHz = match ? parseInt(match[4], 10) : null;
  return { userId, sampleRateHz };
}
