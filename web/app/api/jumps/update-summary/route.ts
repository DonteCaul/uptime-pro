import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSummaryJSON } from "@/lib/csvParser";
import type { Database } from "@/lib/db/types";

/**
 * JSON-only summary update endpoint.
 *
 * Accepts a single summary JSON file, finds the matching jump row by
 * deriving the CSV filename (strip `s_` prefix, swap `.json` → `.csv`),
 * and UPDATEs only the metadata columns. Sensor rows (jump_data_points)
 * and analysis columns are left untouched.
 *
 * Returns 207 multi-status: { results: [{ csv, status, ... }] }
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".json")) {
    return NextResponse.json(
      { error: "Only .json files are accepted" },
      { status: 400 },
    );
  }

  // Derive the matching CSV filename.
  // s_action_469_20190112_1910-240.json → action_469_20190112_1910-240.csv
  const csvFilename = file.name.replace(/^s_/i, "").replace(/\.json$/i, ".csv");

  let json: object;
  try {
    const text = await file.text();
    json = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: `Invalid JSON in ${file.name}` },
      { status: 400 },
    );
  }

  const meta = parseSummaryJSON(json, 0);
  const admin = createAdminClient();

  // Find the matching jump row for this user.
  const { data: jump, error: findErr } = await admin
    .from("jumps")
    .select("id, filename")
    .eq("user_id", user.id)
    .eq("filename", csvFilename)
    .maybeSingle();

  if (!jump) {
    return NextResponse.json(
      {
        results: [
          {
            csv: csvFilename,
            status: "error",
            error: `No matching jump found for ${csvFilename}. Upload the CSV first.`,
          },
        ],
      },
      { status: 207 },
    );
  }

  if (findErr) {
    return NextResponse.json(
      {
        results: [
          {
            csv: csvFilename,
            status: "error",
            error: String(findErr),
          },
        ],
      },
      { status: 207 },
    );
  }

  // Update only the metadata columns — leave sensor data intact.
  type JumpUpdate = Database["public"]["Tables"]["jumps"]["Update"];
  const update: JumpUpdate = {};
  if (meta.jumped_at) update.jumped_at = meta.jumped_at;
  if (meta.exit_altitude_m != null) update.exit_altitude_m = meta.exit_altitude_m;
  if (meta.deployment_altitude_m != null) update.deployment_altitude_m = meta.deployment_altitude_m;
  if (meta.freefall_duration_s != null) update.freefall_duration_s = meta.freefall_duration_s;
  if (meta.max_freefall_speed_ms != null) update.max_freefall_speed_ms = meta.max_freefall_speed_ms;
  if (meta.canopy_duration_s != null) update.canopy_duration_s = meta.canopy_duration_s;
  if (meta.climb_duration_s != null) update.climb_duration_s = meta.climb_duration_s;
  if (meta.exit_lat != null) update.exit_lat = meta.exit_lat;
  if (meta.exit_lon != null) update.exit_lon = meta.exit_lon;
  if (meta.landing_lat != null) update.landing_lat = meta.landing_lat;
  if (meta.landing_lon != null) update.landing_lon = meta.landing_lon;
  if (meta.dz_lat != null) update.dz_lat = meta.dz_lat;
  if (meta.dz_lon != null) update.dz_lon = meta.dz_lon;
  if (meta.discipline_from_summary) update.discipline = meta.discipline_from_summary;
  if (meta.jump_number != null) update.jump_number = meta.jump_number;

  const { error: updateErr } = await admin
    .from("jumps")
    .update(update)
    .eq("id", jump.id);

  if (updateErr) {
    return NextResponse.json(
      {
        results: [
          {
            csv: csvFilename,
            status: "error",
            error: updateErr.message,
          },
        ],
      },
      { status: 207 },
    );
  }

  return NextResponse.json(
    {
      results: [
        {
          csv: csvFilename,
          status: "updated",
          jump_id: jump.id,
          meta,
        },
      ],
    },
    { status: 207 },
  );
}
