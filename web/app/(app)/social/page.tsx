import { createServerClient } from "@/lib/supabase/server";
import { SocialClient } from "./SocialClient";

export const metadata = { title: "Social · UpTime.Pro" };

// ISR — leaderboard recomputed at most once per 60s. The Postgres function
// does the heavy aggregation server-side, so this keeps the four queries off
// the hot path without serving stale-all-day data.
export const revalidate = 60;

interface LeaderUser {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface JumpLeader extends LeaderUser {
  jump_count: number;
}

interface DzLeader extends LeaderUser {
  dz_count: number;
}

interface DiscLeader extends LeaderUser {
  discipline: string;
  jump_count: number;
}

interface HomeDz extends LeaderUser {
  home_dz: string | null;
  home_dz_lat: string | null;
  home_dz_lon: string | null;
}

export interface LeaderboardData {
  jumps: JumpLeader[];
  dzs: DzLeader[];
  disciplines: DiscLeader[];
  homeDzs: HomeDz[];
}

// Pre-fetch all four periods at build/revalidate time so the client can
// switch instantly without a round-trip per tab change.
async function fetchAllPeriods(): Promise<Record<string, LeaderboardData>> {
  const supabase = await createServerClient();
  const periods = ["day", "month", "year", "all"];
  const entries = await Promise.all(
    periods.map(async (period) => {
      const { data, error } = await supabase.rpc("leaderboard", { period });
      if (error) {
        console.warn(`[social] leaderboard(${period}) failed: ${error.message}`);
        return [period, { jumps: [], dzs: [], disciplines: [], homeDzs: [] }] as const;
      }
      return [period, (data ?? {
        jumps: [],
        dzs: [],
        disciplines: [],
        homeDzs: [],
      }) as unknown as LeaderboardData] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export default async function SocialPage() {
  const dataByPeriod = await fetchAllPeriods();
  return <SocialClient dataByPeriod={dataByPeriod} />;
}
