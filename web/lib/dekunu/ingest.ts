import { createAdminClient } from "@/lib/supabase/admin";
import { parseJumpCSV, parseFilename, type JumpMeta } from "@/lib/csvParser";
import type { Database } from "@/lib/db/types";

/**
 * Shared ingest pipeline — used by both the manual upload route (/api/jumps/upload)
 * and the Dekunu device-compat route (/v1/addJumpLog) so both paths produce
 * identical results.
 *
 * For a single uploaded file:
 *   1. Parse the CSV buffer → { meta, rows }
 *   2. Extract device + action type from the filename
 *   3. Upsert the device record (links to the uploading user)
 *   4. Dedupe by (user_id, filename) → skip if already imported
 *   5. Insert the jump row
 *   6. Bulk-insert sensor rows in batches of 200 (the hot path)
 *   7. Upload the raw CSV to Storage for archival
 *
 * Uses the service-role admin client (bypasses RLS) and explicitly scopes every
 * query by userId — RLS would block the bulk telemetry insert since it crosses
 * the jump_data_points → jump ownership join per-row.
 *
 * NOTE: the original Express app wrapped each file in a Postgres transaction
 * (BEGIN/COMMIT/ROLLBACK). The Supabase JS client doesn't expose transaction
 * control, so a partial failure on the telemetry insert could leave an orphan
 * jump row. We mitigate by inserting the jump row only after parse succeeds,
 * and ON DELETE CASCADE on jump_data_points means deleting a jump cleans up.
 */

export interface IngestResult {
  file: string;
  status: "created" | "duplicate" | "error";
  jump_id?: number;
  meta?: JumpMeta;
  error?: string;
}

const BATCH_SIZE = 200;

// Sensor columns in stable order — must match SensorRow keys for bulk insert.
const SENSOR_COLS = [
  "sample_ms", "device_mode", "gps_time", "gps_lat", "gps_lon",
  "gps_altitude_m", "gps_speed_knot", "gps_angle_deg", "gps_sats",
  "pressure_pa", "temperature_c", "altitude_m", "altitude_above_ground_m",
  "ground_level_m", "inst_vert_speed_ms", "compass_angle",
  "accel_x", "accel_y", "accel_z", "gyro_x", "gyro_y", "gyro_z",
  "batt_perc", "pressure_pa_baro2", "temperature_c_baro2", "altitude_m_baro2",
] as const;

export async function ingestJumpFile(
  userId: string,
  filename: string,
  buffer: Buffer,
): Promise<IngestResult> {
  try {
    const admin = createAdminClient();

    // 1. Parse the CSV.
    const { meta, rows } = parseJumpCSV(buffer);

    // 2. Extract device + action type from filename.
    const { deviceId, actionTypeId, discipline } = parseFilename(filename);

    // 3. Upsert device record if we have a deviceId.
    let dbDeviceId: number | null = null;
    if (deviceId) {
      const { data: dev, error: devErr } = await admin
        .from("devices")
        .upsert(
          {
            device_id: deviceId,
            last_seen_at: new Date().toISOString(),
            current_user_id: userId,
          },
          { onConflict: "device_id" },
        )
        .select("id")
        .single();
      if (devErr) throw new Error(`Device upsert failed: ${devErr.message}`);
      dbDeviceId = dev?.id ?? null;
    }

    // 4. Dedupe by (user_id, filename).
    const { data: existing } = await admin
      .from("jumps")
      .select("id")
      .eq("user_id", userId)
      .eq("filename", filename)
      .maybeSingle();
    if (existing) {
      return { file: filename, status: "duplicate", jump_id: existing.id };
    }

    // 5. Insert the jump row.
    const { data: jumpRow, error: jumpErr } = await admin
      .from("jumps")
      .insert({
        user_id: userId,
        device_id: dbDeviceId,
        filename,
        jumped_at: meta.jumped_at,
        exit_altitude_m: meta.exit_altitude_m,
        deployment_altitude_m: meta.deployment_altitude_m,
        freefall_duration_s: meta.freefall_duration_s,
        max_freefall_speed_ms: meta.max_freefall_speed_ms,
        canopy_duration_s: meta.canopy_duration_s,
        exit_lat: meta.exit_lat,
        exit_lon: meta.exit_lon,
        landing_lat: meta.landing_lat,
        landing_lon: meta.landing_lon,
        dz_lat: meta.dz_lat,
        dz_lon: meta.dz_lon,
        row_count: meta.row_count,
        action_type_id: actionTypeId,
        discipline,
        raw_file_storage_key: `${userId}/${filename}`,
      })
      .select("id")
      .single();
    if (jumpErr || !jumpRow) {
      throw new Error(`Jump insert failed: ${jumpErr?.message ?? "no row"}`);
    }
    const jumpId = jumpRow.id;

    // 6. Bulk-insert sensor rows in batches of 200.
    if (rows.length) {
      type JumpDataPointInsert =
        Database["public"]["Tables"]["jump_data_points"]["Insert"];
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        const batch = rows.slice(start, start + BATCH_SIZE);
        const payload: JumpDataPointInsert[] = batch.map((r) => {
          const row: JumpDataPointInsert = { jump_id: jumpId };
          for (const col of SENSOR_COLS) {
            (row as Record<string, unknown>)[col] = r[col] ?? null;
          }
          return row;
        });
        const { error: batchErr } = await admin
          .from("jump_data_points")
          .insert(payload);
        if (batchErr) {
          // Best-effort cleanup: delete the orphan jump so a retry isn't
          // blocked by the dedupe check. CASCADE removes any partial points.
          await admin.from("jumps").delete().eq("id", jumpId);
          throw new Error(
            `Telemetry batch insert failed at offset ${start}: ${batchErr.message}`,
          );
        }
      }
    }

    // 7. Archive the raw CSV to Storage (best-effort — non-fatal if it fails).
    try {
      await admin.storage
        .from("jump-csv")
        .upload(`${userId}/${filename}`, buffer, {
          contentType: "text/csv",
          upsert: true,
        });
    } catch (storageErr) {
      console.warn(
        `[ingest] storage upload failed for ${filename}:`,
        storageErr instanceof Error ? storageErr.message : storageErr,
      );
    }

    return { file: filename, status: "created", jump_id: jumpId, meta };
  } catch (err) {
    return {
      file: filename,
      status: "error",
      error: err instanceof Error ? err.message : "Unknown ingest error",
    };
  }
}

/**
 * Ingest multiple files for a user. Returns one result per file (mirrors the
 * original 207 multi-status response shape).
 */
export async function ingestJumpFiles(
  userId: string,
  files: { filename: string; buffer: Buffer }[],
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const file of files) {
    // Sequential to avoid hammering the DB; the original was sequential too.
    results.push(await ingestJumpFile(userId, file.filename, file.buffer));
  }
  return results;
}
