"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { alt, speed, type UnitSystem } from "@/lib/units";
import { fmtDuration } from "@/lib/format";
import { encodeJumpId } from "@/lib/slug";
import { useUnits } from "@/lib/useUnits";

type Tab = "jumps" | "logs";

const TABS: { id: Tab; label: string }[] = [
  { id: "jumps", label: "Jumps" },
  { id: "logs", label: "System Logs" },
];

interface JumpRow {
  id: number;
  filename: string;
  jumped_at: string | null;
  exit_altitude_m: number | null;
  freefall_duration_s: number | null;
  max_freefall_speed_ms: number | null;
}

interface LogRow {
  id: number;
  log_source: string | null;
  log_number: number | null;
  uploaded_at: string;
}

export function DeviceDetailClient({
  tab,
  jumps,
  logs,
  serverUnits,
  deviceUrlId,
}: {
  tab: Tab;
  jumps: JumpRow[];
  logs: LogRow[];
  serverUnits: UnitSystem;
  deviceUrlId: number;
}) {
  const [activeTab, setActiveTab] = useState<Tab>(tab);
  const units = useUnits(serverUnits);

  function switchTab(t: Tab) {
    setActiveTab(t);
    window.location.href = `/devices/${deviceUrlId}?tab=${t}`;
  }

  return (
    <>
      {/* Tab bar */}
      <div className="flex bg-muted rounded-md p-1 gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTab(t.id)}
            className={cn(
              "flex-1 py-1.5 rounded text-xs font-medium transition-colors text-center relative",
              activeTab === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.id === "jumps" && jumps.length > 0 && (
              <span
                className={cn(
                  "ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                  activeTab === t.id
                    ? "bg-primary/20 text-primary"
                    : "bg-foreground/10 text-muted-foreground",
                )}
              >
                {jumps.length}
              </span>
            )}
            {t.id === "logs" && logs.length > 0 && (
              <span
                className={cn(
                  "ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                  activeTab === t.id
                    ? "bg-primary/20 text-primary"
                    : "bg-foreground/10 text-muted-foreground",
                )}
              >
                {logs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Jumps tab */}
      {activeTab === "jumps" && (
        jumps.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No jumps recorded from this device.
              </p>
            </CardContent>
          </Card>
        ) : (
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
        )
      )}

      {/* Logs tab */}
      {activeTab === "logs" && (
        logs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No system logs for this device.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {logs.map((log) => (
                <Link
                  key={log.id}
                  href={`/devices/${deviceUrlId}/logs/${log.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {log.log_source ?? "syslog"}
                      {log.log_number != null ? ` #${log.log_number}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(log.uploaded_at).toLocaleString()}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </Link>
              ))}
            </CardContent>
          </Card>
        )
      )}
    </>
  );
}
