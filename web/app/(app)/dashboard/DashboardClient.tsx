"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/StatCard";
import { alt, speed, type UnitSystem } from "@/lib/units";
import { fmtDuration } from "@/lib/format";
import { encodeJumpId } from "@/lib/slug";
import { useUnits } from "@/lib/useUnits";

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

export function DashboardClient({
  firstName,
  stats,
  recentJumps,
  serverUnits,
}: {
  firstName: string;
  stats: StatsResult | null;
  recentJumps: RecentJump[];
  serverUnits: UnitSystem;
}) {
  const units = useUnits(serverUnits);
  const hasJumps = (stats?.total_jumps ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">Hey, {firstName}</h2>
        <p className="text-muted-foreground text-sm">
          Here&apos;s your jump summary
        </p>
      </div>

      {!hasJumps ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-8 gap-3">
            <p className="text-muted-foreground text-sm">No jumps yet</p>
            <Button asChild size="sm">
              <Link href="/upload">Upload your first logs</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Total Jumps"
              value={stats?.total_jumps ?? "0"}
            />
            <Link
              href={
                stats?.highest_exit_jump_id
                  ? `/jumps/${encodeJumpId(stats.highest_exit_jump_id)}`
                  : "#"
              }
              aria-disabled={!stats?.highest_exit_jump_id}
              className={
                !stats?.highest_exit_jump_id ? "pointer-events-none" : ""
              }
            >
              <StatCard
                label="Highest Exit"
                value={alt(stats?.highest_exit_m ?? null, units)}
                linkable
              />
            </Link>
            <Link
              href={
                stats?.fastest_ff_jump_id
                  ? `/jumps/${encodeJumpId(stats.fastest_ff_jump_id)}`
                  : "#"
              }
              aria-disabled={!stats?.fastest_ff_jump_id}
              className={
                !stats?.fastest_ff_jump_id ? "pointer-events-none" : ""
              }
            >
              <StatCard
                label="Fastest Freefall"
                value={speed(stats?.fastest_freefall_ms ?? null, units)}
                linkable
              />
            </Link>
            <StatCard
              label="Total Freefall"
              value={fmtDuration(stats?.total_freefall_s ?? null) ?? "—"}
            />
          </div>

          {recentJumps.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Recent Jumps
                </h3>
                <Link
                  href="/jumps"
                  className="text-xs text-primary hover:underline"
                >
                  View all →
                </Link>
              </div>
              <Card>
                <CardContent className="p-0">
                  {recentJumps.map((j) => (
                    <Link
                      key={j.id}
                      href={`/jumps/${encodeJumpId(j.id)}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border last:border-0 first:rounded-t-lg last:rounded-b-lg"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {j.jumped_at
                            ? new Date(j.jumped_at).toLocaleDateString()
                            : j.filename}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {j.exit_altitude_m
                            ? `Exit ${alt(j.exit_altitude_m, units)}`
                            : "No altitude data"}
                          {j.freefall_duration_s
                            ? ` · ${fmtDuration(j.freefall_duration_s)} FF`
                            : ""}
                        </p>
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-muted-foreground"
                      />
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
