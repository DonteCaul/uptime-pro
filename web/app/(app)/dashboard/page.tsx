import { createServerClient } from "@/lib/supabase/server";
import { type UnitSystem } from "@/lib/units";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

interface StatsResult {
  total_jumps: number;
  total_freefall_s: number | null;
  highest_exit_m: number | null;
  highest_exit_jump_id: number | null;
  fastest_freefall_ms: number | null;
  fastest_ff_jump_id: number | null;
  first_jump: string | null;
  last_jump: string | null;
}

interface RecentJump {
  id: number;
  filename: string;
  jumped_at: string | null;
  exit_altitude_m: number | null;
  freefall_duration_s: number | null;
}

export default async function DashboardPage() {
  const supabase = await createServerClient();

  // Resolve the user's unit preference (defaults to metric).
  const { data: profile } = await supabase
    .from("profiles")
    .select("units, full_name")
    .single();
  const units = (profile?.units ?? "metric") as UnitSystem;
  const firstName = profile?.full_name?.split(" ")[0] || "Jumper";

  // Stats (server-side aggregation via RPC) + recent jumps, in parallel.
  const [statsRes, recentRes] = await Promise.all([
    supabase.rpc("user_stats").single(),
    supabase
      .from("jumps")
      .select(
        "id, filename, jumped_at, exit_altitude_m, freefall_duration_s",
      )
      .order("jumped_at", { ascending: false, nullsFirst: false })
      .range(0, 4),
  ]);

  const stats = statsRes.data as StatsResult | null;
  const recentJumps = (recentRes.data ?? []) as RecentJump[];

  return (
    <DashboardClient
      firstName={firstName}
      stats={stats}
      recentJumps={recentJumps}
      serverUnits={units}
    />
  );
}
