"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { alt, speed, type UnitSystem } from "@/lib/units";
import { fmtDuration } from "@/lib/format";
import { encodeJumpId } from "@/lib/slug";
import { useUnits } from "@/lib/useUnits";

export interface JumpRow {
  id: number;
  filename: string;
  jumped_at: string | null;
  exit_altitude_m: number | null;
  freefall_duration_s: number | null;
  max_freefall_speed_ms: number | null;
  jump_number: number | null;
  exit_lat: number | null;
  exit_lon: number | null;
  dz_lat: number | null;
  dz_lon: number | null;
  row_count: number | null;
}

export function JumpRowItemClient({
  jump,
  index,
  serverUnits,
  className,
}: {
  jump: JumpRow;
  index?: number;
  serverUnits: UnitSystem;
  className?: string;
}) {
  const units = useUnits(serverUnits);

  return (
    <Link
      href={`/jumps/${encodeJumpId(jump.id)}`}
      className={cn(
        "flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border last:border-0",
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {(jump.jump_number != null || index != null) && (
          <span className="text-sm font-bold text-muted-foreground/60 w-6 text-right shrink-0 tabular-nums">
            {jump.jump_number ?? index}
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
