const { parse } = require('csv-parse/sync');

// Parse a UpTime.Pro jump log CSV buffer and return { meta, rows }
function parseJumpCSV(buffer) {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    quote: false,
    relax_column_count: true,
    cast: (value, context) => {
      if (context.header) return value;
      // UpTime.Pro firmware uses < / > as overflow/underflow markers (e.g. "<0.07")
      const cleaned = value.replace(/^[<>]/, '');
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    },
  });

  if (!records.length) return { meta: {}, rows: [] };

  const first = records[0];
  const last = records[records.length - 1];

  // Determine max altitude (exit point) over whole flight
  let maxAlt = 0;
  let exitRow = first;
  for (const r of records) {
    if (r.altitudeMeters > maxAlt) {
      maxAlt = r.altitudeMeters;
      exitRow = r;
    }
  }

  // First valid GPS fix during the climb phase (DeviceMode=2) = DZ location
  let dzRow = null;
  for (const r of records) {
    if (r.DeviceMode === 2 && r.gpsLatitude && r.gpsLongitude) { dzRow = r; break; }
  }
  // Fall back to first record with valid GPS
  if (!dzRow) {
    for (const r of records) {
      if (r.gpsLatitude && r.gpsLongitude) { dzRow = r; break; }
    }
  }

  // gpsTime is already a Unix timestamp (seconds since 1970-01-01)
  const jumpedAt = first.gpsTime
    ? new Date(first.gpsTime * 1000).toISOString()
    : null;

  // Use DeviceMode transitions for accurate phase detection:
  //   2 = plane/climb, 3 = freefall, 4 = canopy, 5 = ground
  let freefallStartIdx = null;
  let freefallEndIdx   = null;
  let canopyEndIdx     = null;
  let deployAlt        = null;

  for (let i = 0; i < records.length; i++) {
    const mode = records[i].DeviceMode;
    if (mode === 3 && freefallStartIdx === null) freefallStartIdx = i;
    if (freefallStartIdx !== null && mode !== 3 && freefallEndIdx === null) {
      freefallEndIdx = i;
      deployAlt = records[i].altitudeMeters;
    }
    if (freefallEndIdx !== null && mode === 4) canopyEndIdx = i;
  }

  // Max speed during freefall using 90th percentile to reject deployment pressure spikes.
  // A simple raw-max picks up the parachute-opening pressure transient; sorting and
  // taking the 90th percentile gives the true peak sustained speed.
  let maxSpeed = 0;
  if (freefallStartIdx !== null) {
    const end = freefallEndIdx ?? records.length - 1;
    const speeds = [];
    for (let i = freefallStartIdx; i <= end; i++) {
      const v = records[i].instVertSpeedMetersPerSec;
      if (v != null && isFinite(v)) speeds.push(Math.abs(v));
    }
    if (speeds.length) {
      speeds.sort((a, b) => a - b);
      const p90 = speeds[Math.floor(speeds.length * 0.90)];
      maxSpeed = p90;
    }
  }

  const freefallDuration = (freefallStartIdx !== null && freefallEndIdx !== null)
    ? (records[freefallEndIdx].Timestamp - records[freefallStartIdx].Timestamp) / 1000
    : null;
  const canopyDuration = (freefallEndIdx !== null && canopyEndIdx !== null)
    ? (records[canopyEndIdx].Timestamp - records[freefallEndIdx].Timestamp) / 1000
    : null;

  const meta = {
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
    dz_lat: dzRow ? dzRow.gpsLatitude / 1e6 : null,
    dz_lon: dzRow ? dzRow.gpsLongitude / 1e6 : null,
    row_count: records.length,
  };

  const rows = records.map((r) => ({
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

module.exports = { parseJumpCSV };
