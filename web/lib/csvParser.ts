import { parse } from "csv-parse/sync";

/**
 * Parse a UpTime.Pro jump log CSV buffer.
 *
 * Faithful port of backend/src/utils/csvParser.js. Returns { meta, rows } where
 * `meta` is the aggregated jump summary and `rows` are the per-sample sensor
 * points ready for bulk insert.
 *
 * UpTime.Pro firmware quirks preserved:
 *  - `<` / `>` overflow markers (e.g. "<0.07") are stripped before numeric cast
 *  - gpsLat/gpsLon are stored ×1e6 in the CSV; divided out here
 *  - DeviceMode: 2=climb, 3=freefall, 4=canopy, 5=ground
 *  - Max freefall speed uses the 90th percentile to reject the deployment
 *    pressure transient (a raw-max picks up the canopy-opening spike)
 */

export interface JumpMeta {
  jumped_at: string | null;
  exit_altitude_m: number;
  deployment_altitude_m: number | null;
  freefall_duration_s: number | null;
  max_freefall_speed_ms: number;
  canopy_duration_s: number | null;
  exit_lat: number | null;
  exit_lon: number | null;
  landing_lat: number | null;
  landing_lon: number | null;
  dz_lat: number | null;
  dz_lon: number | null;
  row_count: number;
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

  // Determine max altitude (exit point) over whole flight.
  let maxAlt = 0;
  let exitRow = first;
  for (const r of records) {
    if ((r.altitudeMeters ?? 0) > maxAlt) {
      maxAlt = r.altitudeMeters ?? 0;
      exitRow = r;
    }
  }

  // First valid GPS fix during the climb phase (DeviceMode=2) = DZ location.
  let dzRow: ParsedRecord | null = null;
  for (const r of records) {
    if (r.DeviceMode === 2 && r.gpsLatitude && r.gpsLongitude) {
      dzRow = r;
      break;
    }
  }
  // Fall back to first record with valid GPS.
  if (!dzRow) {
    for (const r of records) {
      if (r.gpsLatitude && r.gpsLongitude) {
        dzRow = r;
        break;
      }
    }
  }

  // gpsTime is already a Unix timestamp (seconds since 1970-01-01).
  const jumpedAt = first.gpsTime
    ? new Date(first.gpsTime * 1000).toISOString()
    : null;

  // Phase detection via DeviceMode transitions.
  let freefallStartIdx: number | null = null;
  let freefallEndIdx: number | null = null;
  let canopyEndIdx: number | null = null;
  let deployAlt: number | null = null;

  for (let i = 0; i < records.length; i++) {
    const mode = records[i].DeviceMode;
    if (mode === 3 && freefallStartIdx === null) freefallStartIdx = i;
    if (freefallStartIdx !== null && mode !== 3 && freefallEndIdx === null) {
      freefallEndIdx = i;
      deployAlt = records[i].altitudeMeters;
    }
    if (freefallEndIdx !== null && mode === 4) canopyEndIdx = i;
  }

  // Max speed during freefall using 90th percentile (rejects deployment spike).
  let maxSpeed = 0;
  if (freefallStartIdx !== null) {
    const end = freefallEndIdx ?? records.length - 1;
    const speeds: number[] = [];
    for (let i = freefallStartIdx; i <= end; i++) {
      const v = records[i].instVertSpeedMetersPerSec;
      if (v != null && isFinite(v)) speeds.push(Math.abs(v));
    }
    if (speeds.length) {
      speeds.sort((a, b) => a - b);
      maxSpeed = speeds[Math.floor(speeds.length * 0.9)] ?? 0;
    }
  }

  const freefallDuration =
    freefallStartIdx !== null && freefallEndIdx !== null
      ? ((records[freefallEndIdx].Timestamp ?? 0) -
          (records[freefallStartIdx].Timestamp ?? 0)) /
        1000
      : null;
  const canopyDuration =
    freefallEndIdx !== null && canopyEndIdx !== null
      ? ((records[canopyEndIdx].Timestamp ?? 0) -
          (records[freefallEndIdx].Timestamp ?? 0)) /
        1000
      : null;

  const meta: JumpMeta = {
    jumped_at: jumpedAt,
    exit_altitude_m: maxAlt,
    deployment_altitude_m: deployAlt,
    freefall_duration_s: freefallDuration,
    max_freefall_speed_ms: maxSpeed,
    canopy_duration_s: canopyDuration,
    exit_lat: exitRow.gpsLatitude ? exitRow.gpsLatitude / 1e6 : null,
    exit_lon: exitRow.gpsLongitude ? exitRow.gpsLongitude / 1e6 : null,
    landing_lat: last.gpsLatitude ? last.gpsLatitude / 1e6 : null,
    landing_lon: last.gpsLongitude ? last.gpsLongitude / 1e6 : null,
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

// ─── Filename parsing ───────────────────────────────────────────────────────
// Dekunu filenames: action_<deviceId>_<YYYYMMDD>_<HHMM>-<actionTypeId>.csv

export interface ParsedFilename {
  deviceId: number | null;
  actionTypeId: number | null;
  discipline: string | null;
}

// Map Dekunu action type IDs to discipline strings (matches original).
const ACTION_TYPE_DISCIPLINE: Record<number, string> = {
  240: "Belly / RW",
  300: "BASE",
};

export function parseFilename(filename: string): ParsedFilename {
  const match = filename.match(/action_(\d+)_(\d{8})_(\d{4})-(\d+)/);
  const deviceId = match ? parseInt(match[1], 10) : null;
  const actionTypeId = match ? parseInt(match[4], 10) : null;
  const discipline = actionTypeId
    ? ACTION_TYPE_DISCIPLINE[actionTypeId] ?? null
    : null;
  return { deviceId, actionTypeId, discipline };
}
