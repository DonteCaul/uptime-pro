import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { decodeJumpSlug } from "@/lib/slug";
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
  climb_duration_s: number | null;
  jump_number: number | null;
  exit_lat: number | null;
  exit_lon: number | null;
  notes: string | null;
  discipline: string | null;
  is_public: boolean;
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

/**
 * Fetch a single jump with its prev/next neighbors using a Supabase RPC.
 * Uses a CTE + LAG/LEAD window function in Postgres so only 3 rows
 * are returned instead of fetching the user's entire jump history.
 *
 * Requires the `jump_with_neighbors(p_jump_id bigint)` RPC to exist in
 * the database (see migration 0019).
 */
async function getJumpWithNeighbors(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  id: number,
): Promise<JumpDetail | null> {
  const { data, error } = await supabase.rpc("jump_with_neighbors", {
    p_jump_id: id,
  });

  if (error || !data || !data.length) return null;

  const row = data[0];
  return {
    id: row.id,
    filename: row.filename as string,
    jumped_at: row.jumped_at,
    exit_altitude_m: row.exit_altitude_m,
    deployment_altitude_m: row.deployment_altitude_m,
    freefall_duration_s: row.freefall_duration_s,
    max_freefall_speed_ms: row.max_freefall_speed_ms,
    canopy_duration_s: row.canopy_duration_s,
    climb_duration_s: row.climb_duration_s,
    jump_number: row.jump_number,
    exit_lat: row.exit_lat,
    exit_lon: row.exit_lon,
    notes: row.notes,
    discipline: row.discipline,
    is_public: row.is_public ?? false,
    row_count: row.row_count,
    prev_id: row.prev_id,
    next_id: row.next_id,
  };
}

export default async function JumpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  // Decode the opaque slug → numeric id. Falls back to plain-int for backward
  // compat with any old shared links.
  const id = decodeJumpSlug(idStr) ?? (/^\d+$/.test(idStr) ? parseInt(idStr, 10) : null);
  if (id == null || Number.isNaN(id)) notFound();

  const supabase = await createServerClient();

  // 1. Jump metadata + neighbors, profile units, and track data in parallel.
  const [jumpResult, profileResult, trackResult] = await Promise.all([
    getJumpWithNeighbors(supabase, id),
    supabase.from("profiles").select("units").single(),
    (async () => {
      const TRACK_COLS =
        "sample_ms, device_mode, gps_lat, gps_lon, gps_altitude_m, altitude_m, altitude_above_ground_m, inst_vert_speed_ms, gps_speed_knot, gps_angle_deg, accel_x, accel_y, accel_z, temperature_c, batt_perc";
      const PAGE_SIZE = 1000;
      let allRows: TrackPoint[] = [];
      let offset = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: pageRows } = await supabase
          .from("jump_data_points")
          .select(TRACK_COLS)
          .eq("jump_id", id)
          .order("sample_ms", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (!pageRows?.length) break;
        allRows.push(...pageRows);
        if (pageRows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      return allRows;
    })(),
  ]);

  const jump = jumpResult;
  if (!jump) notFound();

  const units = (profileResult.data?.units ?? "metric") as UnitSystem;
  const track = trackResult;

  // 4. Weather (server-side via the cached proxy — no key in the browser).
  //    Only fetch if the jump has GPS coords + timestamp.
  let weather: WeatherSummary | null = null;
  if (jump.exit_lat && jump.exit_lon && jump.jumped_at) {
    try {
      const wxRes = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/weather?lat=${jump.exit_lat}&lon=${jump.exit_lon}&at=${encodeURIComponent(jump.jumped_at)}`,
        {
          cache: "force-cache",
          headers: { Cookie: (await cookies()).toString() },
        },
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
