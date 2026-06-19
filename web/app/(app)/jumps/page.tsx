import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UnitSystem } from "@/lib/units";
import { encodeJumpId } from "@/lib/slug";
import { JumpsTabsClient } from "./JumpsTabsClient";
import { JumpRowItemClient, type JumpRow } from "./JumpRowItemClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("units")
    .single();
  const units = (profile?.units ?? "metric") as UnitSystem;

  // Fetch the total count for the current user only.
  const { count } = await supabase
    .from("jumps")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId!);

  // All-tab fetches a paginated slice server-side.
  const { data: pageJumps } = await supabase
    .from("jumps")
    .select(
      "id, filename, jumped_at, exit_altitude_m, freefall_duration_s, max_freefall_speed_ms, jump_number, row_count",
    )
    .eq("user_id", userId!)
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
                  <JumpRowItemClient
                    key={j.id}
                    jump={j}
                    index={offset + i + 1}
                    serverUnits={units}
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
                asChild={hasPrev}
                disabled={!hasPrev}
              >
                <Link
                  href={`/jumps?tab=all&offset=${Math.max(0, offset - PAGE_SIZE)}`}
                  aria-disabled={!hasPrev}
                >
                  ← Prev
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, count)} of {count}
              </span>
              <Button
                variant="secondary"
                size="sm"
                asChild={hasNext}
                disabled={!hasNext}
              >
                <Link
                  href={`/jumps?tab=all&offset=${offset + PAGE_SIZE}`}
                  aria-disabled={!hasNext}
                >
                  Next →
                </Link>
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
