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

interface DropzoneLocation {
  dz_lat: number;
  dz_lon: number;
  jump_count: number;
}

export interface LeaderboardData {
  jumps: JumpLeader[];
  dzs: DzLeader[];
  disciplines: DiscLeader[];
  homeDzs: DropzoneLocation[];
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

// Fetch community-wide aggregate stats for the ticker at the bottom of the page.
async function fetchCommunityStats(): Promise<{
  users: number;
  jumps: number;
  total_ft: number;
  freefall_hrs: number;
  dropzones: number;
}> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("community_stats");
  if (error || !data) {
    console.warn(`[social] community_stats failed: ${error?.message}`);
    return { users: 0, jumps: 0, total_ft: 0, freefall_hrs: 0, dropzones: 0 };
  }
  const raw = data as Record<string, unknown>;
  return {
    users: Number(raw.users ?? 0),
    jumps: Number(raw.jumps ?? 0),
    total_ft: Number(raw.total_ft ?? 0),
    freefall_hrs: Number(raw.freefall_hrs ?? 0),
    dropzones: Number(raw.dropzones ?? 0),
  };
}

export default async function SocialPage() {
  const [dataByPeriod, communityStats] = await Promise.all([
    fetchAllPeriods(),
    fetchCommunityStats(),
  ]);
  return <SocialClient dataByPeriod={dataByPeriod} communityStats={communityStats} />;
}
