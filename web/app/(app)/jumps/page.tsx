import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { alt, speed, type UnitSystem } from "@/lib/units";
import { fmtDuration } from "@/lib/format";
import { JumpsTabsClient } from "./JumpsTabsClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

interface JumpRow {
  id: number;
  filename: string;
  jumped_at: string | null;
  exit_altitude_m: number | null;
  freefall_duration_s: number | null;
  max_freefall_speed_ms: number | null;
  exit_lat: number | null;
  exit_lon: number | null;
  dz_lat: number | null;
  dz_lon: number | null;
}

function JumpRowItem({
  jump,
  index,
  units,
  className,
}: {
  jump: JumpRow;
  index?: number;
  units: UnitSystem;
  className?: string;
}) {
  return (
    <Link
      href={`/jumps/${jump.id}`}
      className={cn(
        "flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border last:border-0",
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {index != null && (
          <span className="text-sm font-bold text-muted-foreground/60 w-6 text-right shrink-0 tabular-nums">
            {index}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {jump.jumped_at
              ? new Date(jump.jumped_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : (jump.filename?.replace(".csv", "") || "Unknown")}
          </p>
          <div className="flex gap-2 mt-0.5 flex-wrap">
            {jump.exit_altitude_m && (
              <span className="text-xs text-muted-foreground">
                ↑ {alt(jump.exit_altitude_m, units)}
              </span>
            )}
            {jump.freefall_duration_s && (
              <span className="text-xs text-muted-foreground">
                FF {fmtDuration(jump.freefall_duration_s)}
              </span>
            )}
            {jump.max_freefall_speed_ms && (
              <span className="text-xs text-primary">
                {speed(jump.max_freefall_speed_ms, units)}
              </span>
            )}
          </div>
        </div>
      </div>
      <ChevronRight size={16} className="text-muted-foreground shrink-0 ml-2" />
    </Link>
  );
}

export default async function JumpsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; offset?: string }>;
}) {
  const params = await searchParams;
  const tab = (params.tab ?? "all") as "all" | "dropzone" | "map";
  const offset = Math.max(0, parseInt(params.offset ?? "0") || 0);

  const supabase = await createServerClient();

  // Resolve unit preference (defaults to metric).
  const { data: profile } = await supabase
    .from("profiles")
    .select("units")
    .single();
  const units = (profile?.units ?? "metric") as UnitSystem;

  // Fetch the total count (cheap) — always needed for the header.
  const { count } = await supabase
    .from("jumps")
    .select("id", { count: "exact", head: true });

  // All-tab fetches a paginated slice server-side.
  const { data: pageJumps } = await supabase
    .from("jumps")
    .select(
      "id, filename, jumped_at, exit_altitude_m, freefall_duration_s, max_freefall_speed_ms",
    )
    .order("jumped_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);
  const jumps = (pageJumps ?? []) as JumpRow[];

  const tabs = [
    { id: "all" as const, label: "All Jumps" },
    { id: "dropzone" as const, label: "By Dropzone" },
    { id: "map" as const, label: "Map" },
  ];

  const hasNext = count ? offset + PAGE_SIZE < count : false;
  const hasPrev = offset > 0;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Jump Log</h2>
        {count != null && (
          <span className="text-sm text-muted-foreground">
            {count} jumps
          </span>
        )}
      </div>

      {/* Tab navigation — links that set ?tab=, preserving offset only for All. */}
      <div className="flex bg-muted rounded-md p-1 gap-1">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/jumps?tab=${t.id}`}
            className={cn(
              "flex-1 py-1.5 rounded text-xs font-medium transition-colors text-center",
              tab === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "all" && (
        <>
          {jumps.length === 0 ? (
            <div className="text-center text-muted-foreground py-10">
              No jumps yet.{" "}
              <Link href="/upload" className="text-primary hover:underline">
                Upload logs
              </Link>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                {jumps.map((j, i) => (
                  <JumpRowItem
                    key={j.id}
                    jump={j}
                    index={offset + i + 1}
                    units={units}
                    className={cn(
                      i === 0 && "first:rounded-t-lg",
                      i === jumps.length - 1 && "last:rounded-b-lg",
                    )}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {count != null && count > PAGE_SIZE && (
            <div className="flex justify-between items-center pt-2">
              <Button
                variant="secondary"
                size="sm"
                asChild={!hasPrev}
                disabled={!hasPrev}
              >
                {hasPrev ? (
                  <Link href={`/jumps?tab=all&offset=${Math.max(0, offset - PAGE_SIZE)}`}>
                    ← Prev
                  </Link>
                ) : (
                  "← Prev"
                )}
              </Button>
              <span className="text-xs text-muted-foreground">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, count)} of {count}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasNext}
              >
                {hasNext ? (
                  <Link href={`/jumps?tab=all&offset=${offset + PAGE_SIZE}`}>
                    Next →
                  </Link>
                ) : (
                  "Next →"
                )}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Dropzone + Map tabs are client-rendered (need all jumps + interactivity). */}
      {(tab === "dropzone" || tab === "map") && (
        <JumpsTabsClient tab={tab} units={units} />
      )}
    </div>
  );
}
