"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { alt, speed, type UnitSystem } from "@/lib/units";
import { fmtDuration } from "@/lib/format";
import { encodeJumpId } from "@/lib/slug";
import { useUnits } from "@/lib/useUnits";

interface JumpRow {
  id: number;
  filename: string;
  jumped_at: string | null;
  exit_altitude_m: number | null;
  freefall_duration_s: number | null;
  max_freefall_speed_ms: number | null;
}

export function DeviceJumpsClient({
  jumps,
  serverUnits,
}: {
  jumps: JumpRow[];
  serverUnits: UnitSystem;
}) {
  const units = useUnits(serverUnits);

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {jumps.length} jump{jumps.length !== 1 ? "s" : ""}
      </p>
      <Card>
        <CardContent className="p-0">
          {jumps.map((j) => (
            <Link
              key={j.id}
              href={`/jumps/${encodeJumpId(j.id)}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {j.jumped_at
                    ? new Date(j.jumped_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : j.filename}
                </p>
                <div className="flex gap-2 mt-0.5 flex-wrap">
                  {j.exit_altitude_m && (
                    <span className="text-xs text-muted-foreground">
                      ↑ {alt(j.exit_altitude_m, units)}
                    </span>
                  )}
                  {j.freefall_duration_s && (
                    <span className="text-xs text-muted-foreground">
                      FF {fmtDuration(j.freefall_duration_s)}
                    </span>
                  )}
                  {j.max_freefall_speed_ms && (
                    <span className="text-xs text-primary">
                      {speed(j.max_freefall_speed_ms, units)}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
