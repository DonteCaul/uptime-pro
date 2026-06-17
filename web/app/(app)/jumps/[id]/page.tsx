import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { JumpDetailClient } from "./JumpDetailClient";
import type { UnitSystem } from "@/lib/units";
import type { WeatherSummary } from "@/lib/weather";

export const dynamic = "force-dynamic";

interface JumpDetail {
  id: number;
  filename: string;
  jumped_at: string | null;
  exit_altitude_m: number | null;
  deployment_altitude_m: number | null;
  freefall_duration_s: number | null;
  max_freefall_speed_ms: number | null;
  canopy_duration_s: number | null;
  exit_lat: number | null;
  exit_lon: number | null;
  notes: string | null;
  discipline: string | null;
  row_count: number | null;
  prev_id: number | null;
  next_id: number | null;
}

interface TrackPoint {
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
  accel_x: number | null;
  accel_y: number | null;
  accel_z: number | null;
  temperature_c: number | null;
  batt_perc: number | null;
}

/** Compute prev/next ids via a window query (same approach as the original). */
async function getJumpWithNeighbors(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  id: number,
): Promise<JumpDetail | null> {
  // Fetch all the user's jump ids in display order, then find neighbors.
  const { data: allJumps } = await supabase
    .from("jumps")
    .select(
      "id, filename, jumped_at, exit_altitude_m, deployment_altitude_m, freefall_duration_s, max_freefall_speed_ms, canopy_duration_s, exit_lat, exit_lon, notes, discipline, row_count",
    )
    .order("jumped_at", { ascending: false, nullsFirst: false });

  if (!allJumps) return null;

  const idx = allJumps.findIndex(
    (j) => String(j.id) === String(id),
  );
  if (idx === -1) return null;

  const jump = allJumps[idx] as Omit<JumpDetail, "prev_id" | "next_id">;
  return {
    ...jump,
    // Display order is DESC (newest first), so "next" is the newer jump
    // (idx-1) and "prev" is the older jump (idx+1) — matches the original
    // app's semantics where next_id = newer, prev_id = older.
    prev_id: idx + 1 < allJumps.length ? (allJumps[idx + 1].id as number) : null,
    next_id: idx - 1 >= 0 ? (allJumps[idx - 1].id as number) : null,
  };
}

export default async function JumpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);
  if (Number.isNaN(id)) notFound();

  const supabase = await createServerClient();

  // 1. Jump metadata + neighbors.
  const jump = await getJumpWithNeighbors(supabase, id);
  if (!jump) notFound();

  // 2. Unit preference.
  const { data: profile } = await supabase
    .from("profiles")
    .select("units")
    .single();
  const units = (profile?.units ?? "metric") as UnitSystem;

  // 3. Track (full sensor stream for the replay).
  const { data: trackRows } = await supabase
    .from("jump_data_points")
    .select(
      "sample_ms, device_mode, gps_lat, gps_lon, gps_altitude_m, altitude_m, altitude_above_ground_m, inst_vert_speed_ms, gps_speed_knot, gps_angle_deg, accel_x, accel_y, accel_z, temperature_c, batt_perc",
    )
    .eq("jump_id", id)
    .order("sample_ms", { ascending: true });
  const track = (trackRows ?? []) as TrackPoint[];

  // 4. Weather (server-side via the cached proxy — no key in the browser).
  //    Only fetch if the jump has GPS coords + timestamp.
  let weather: WeatherSummary | null = null;
  if (jump.exit_lat && jump.exit_lon && jump.jumped_at) {
    try {
      const wxRes = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/weather?lat=${jump.exit_lat}&lon=${jump.exit_lon}&at=${encodeURIComponent(jump.jumped_at)}`,
        { cache: "force-cache" },
      );
      if (wxRes.ok) weather = (await wxRes.json()) as WeatherSummary;
    } catch {
      // non-fatal — weather card just won't render
    }
  }

  return (
    <JumpDetailClient
      jump={jump}
      track={track}
      weather={weather}
      units={units}
    />
  );
}
