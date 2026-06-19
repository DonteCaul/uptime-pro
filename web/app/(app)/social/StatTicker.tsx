"use client";

import { Users, TrendingUp, Mountain, Timer, MapPin } from "lucide-react";
import { useCountUp, formatStat } from "@/lib/useCountUp";

export interface CommunityStats {
  users: number;
  jumps: number;
  total_ft: number;
  freefall_hrs: number;
  dropzones: number;
}

interface StatDef {
  key: keyof CommunityStats;
  label: string;
  icon: React.ReactNode;
  decimals: number;
  suffix?: string;
}

const STATS: StatDef[] = [
  { key: "users", label: "Users", icon: <Users className="h-4 w-4" />, decimals: 0 },
  { key: "jumps", label: "Jumps Logged", icon: <TrendingUp className="h-4 w-4" />, decimals: 0 },
  { key: "total_ft", label: "Total FT Jumped", icon: <Mountain className="h-4 w-4" />, decimals: 0 },
  { key: "freefall_hrs", label: "Hours in Freefall", icon: <Timer className="h-4 w-4" />, decimals: 1, suffix: " hrs" },
  { key: "dropzones", label: "Dropzones Visited", icon: <MapPin className="h-4 w-4" />, decimals: 0 },
];

function AnimatedStat({ stat, target }: { stat: StatDef; target: number }) {
  const { ref, value } = useCountUp({
    target,
    duration: 2000,
    decimals: stat.decimals,
  });

  return (
    <div ref={ref} className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {stat.icon}
        <span className="text-xs font-medium uppercase tracking-wider">{stat.label}</span>
      </div>
      <span className="text-2xl font-bold tabular-nums leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>
        {formatStat(value, stat.decimals)}
        {stat.suffix}
      </span>
    </div>
  );
}

export function StatTicker({ stats }: { stats: CommunityStats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
      {STATS.map((stat) => (
        <AnimatedStat key={stat.key} stat={stat} target={stats[stat.key]} />
      ))}
    </div>
  );
}
