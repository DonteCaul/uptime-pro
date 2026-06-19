import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseJumpCSV,
  parseSummaryJSON,
  parseFilename,
  type JumpMeta,
} from "@/lib/csvParser";
import type { Database } from "@/lib/db/types";

/**
 * Shared ingest pipeline — used by both the manual upload route (/api/jumps/upload)
 * and the Dekunu device-compat route (/v1/addJumpLog) so both paths produce
 * identical results.
 *
 * For a single uploaded file:
 *   1. Parse the CSV buffer → { meta, rows }
 *   2. If a summary JSON is provided, parse it and use its meta (more accurate)
 *   3. Extract device + action type from the filename
 *   4. Upsert the device record (links to the uploading user)
 *   5. Dedupe by (user_id, filename) → skip if already imported
 *   6. Read + assign jump_number from profiles.next_jump_number
 *   7. Insert the jump row
 *   8. Bulk-insert sensor rows in batches of 200 (the hot path)
 *   9. Compute analysis summary RPC
 *   10. Archive the raw CSV to Storage for archival
 *
 * Uses the service-role admin client (bypasses RLS) and explicitly scopes every
 * query by userId — RLS would block the bulk telemetry insert since it crosses
 * the jump_data_points → jump ownership join per-row.
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

/**
 * Ingest a single jump file.
 *
 * When `summaryBuffer` is provided (manual upload with paired JSON),
 * the summary's pre-computed values are used for jump metadata — this is
 * significantly more accurate than deriving from raw CSV sensor data.
 *
 * When `summaryBuffer` is omitted (device WiFi sync), the CSV-only fallback
 * is used with bug-fixed derivation logic.
 */
export async function ingestJumpFile(
  userId: string,
  filename: string,
  buffer: Buffer,
  summaryBuffer?: Buffer,
): Promise<IngestResult> {
  try {
    const admin = createAdminClient();

    // 1. Parse the CSV (always needed for sensor rows).
    const { meta: csvMeta, rows } = parseJumpCSV(buffer);

    // 2. Use summary JSON for metadata if available, otherwise CSV fallback.
    let meta: JumpMeta;
    let summaryDiscipline: string | null = null;
    let summaryJumpNumber: number | null = null;

    if (summaryBuffer) {
      try {
        const json = JSON.parse(summaryBuffer.toString("utf-8"));
        meta = parseSummaryJSON(json, rows.length);
        summaryDiscipline = meta.discipline_from_summary ?? null;
        summaryJumpNumber = meta.jump_number ?? null;
      } catch {
        // If JSON parse fails, fall back to CSV-derived meta.
        console.warn(`[ingest] summary JSON parse failed for ${filename}, using CSV fallback`);
        meta = csvMeta;
      }
    } else {
      meta = csvMeta;
    }

    // 3. Extract user ID from filename (no discipline or action type
    //    derivable from the filename — the post-dash number is sample rate Hz).
    const { userId: filenameUserId } = parseFilename(filename);

    // 4. Upsert device record if we have a userId from the filename.
    //    The devices table uses device_id (the Dekunu hardware serial),
    //    which is the first number in the filename.
    let dbDeviceId: number | null = null;
    if (filenameUserId) {
      const { data: dev, error: devErr } = await admin
        .from("devices")
        .upsert(
          {
            device_id: filenameUserId,
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

    // 5. Dedupe by (user_id, filename).
    const { data: existing } = await admin
      .from("jumps")
      .select("id")
      .eq("user_id", userId)
      .eq("filename", filename)
      .maybeSingle();
    if (existing) {
      return { file: filename, status: "duplicate", jump_id: existing.id };
    }

    // 6. Assign jump_number from profile's next_jump_number counter.
    // If the summary provides a customJumpNum, use that instead.
    let jumpNumber: number | null = summaryJumpNumber;
    if (jumpNumber == null) {
      const { data: profile } = await admin
        .from("profiles")
        .select("next_jump_number")
        .eq("id", userId)
        .single();
      if (profile?.next_jump_number != null) {
        jumpNumber = profile.next_jump_number as number;
        // Increment the counter for the next jump.
        await admin
          .from("profiles")
          .update({ next_jump_number: jumpNumber + 1 })
          .eq("id", userId);
      }
    }

    // 7. Insert the jump row.
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
        climb_duration_s: meta.climb_duration_s,
        exit_lat: meta.exit_lat,
        exit_lon: meta.exit_lon,
        landing_lat: meta.landing_lat,
        landing_lon: meta.landing_lon,
        dz_lat: meta.dz_lat,
        dz_lon: meta.dz_lon,
        row_count: meta.row_count,
        discipline: summaryDiscipline,
        jump_number: jumpNumber,
        raw_file_storage_key: `${userId}/${filename}`,
      })
      .select("id")
      .single();
    if (jumpErr || !jumpRow) {
      throw new Error(`Jump insert failed: ${jumpErr?.message ?? "no row"}`);
    }
    const jumpId = jumpRow.id;

    // 8. Bulk-insert sensor rows in batches of 200.
    if (rows.length) {
      type JumpDataPointInsert =
        Database["public"]["Tables"]["jump_data_points"]["Insert"];
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        const batch = rows.slice(start, start + BATCH_SIZE);
        const payload: JumpDataPointInsert[] = batch.map((r) => {
          const row: JumpDataPointInsert = { jump_id: jumpId };
          for (const col of SENSOR_COLS) {
            const val = r[col] ?? null;
            // device_mode and gps_sats are smallint in the DB — the CSV
            // parser parseFloats all numerics, so firmware values like
            // "2.1" (mode transition) must be rounded to integers.
            if ((col === "device_mode" || col === "gps_sats") && val != null) {
              (row as Record<string, unknown>)[col] = Math.round(val as number);
            } else {
              (row as Record<string, unknown>)[col] = val;
            }
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

    // 9. Compute analysis summary from sensor data.
    if (rows.length) {
      try {
        await admin.rpc("compute_jump_analysis", { jump_id: jumpId });
      } catch (analysisErr) {
        console.warn(
          `[ingest] analysis computation failed for ${filename}:`,
          analysisErr instanceof Error ? analysisErr.message : analysisErr,
        );
      }
    }

    // 9b. Override analysis columns with firmware-smoothed summary values when
    // available. The summary JSON provides pre-computed metrics that account for
    // barometric lag and sensor transients — more accurate than raw sensor math.
    if (summaryBuffer) {
      type JumpUpdate = Database["public"]["Tables"]["jumps"]["Update"];
      const overrides: JumpUpdate = {};
      if (meta.avg_freefall_speed_ms != null)
        overrides.avg_freefall_speed_ms = meta.avg_freefall_speed_ms;
      if (meta.opening_peak_g != null)
        overrides.opening_peak_g = meta.opening_peak_g;
      if (Object.keys(overrides).length > 0) {
        await admin
          .from("jumps")
          .update(overrides)
          .eq("id", jumpId);
      }
    }

    // 10. Archive the raw CSV to Storage (best-effort — non-fatal if it fails).
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
