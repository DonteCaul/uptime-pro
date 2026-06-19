"use client";

import type { UnitSystem } from "@/lib/units";
import type { WeatherSummary } from "@/lib/weather";

// Skydiving wind safety thresholds (in knots).
const THRESHOLDS = [
  { max: 8, color: "#22c55e", bg: "#22c55e20", label: "Calm" },
  { max: 15, color: "#84cc16", bg: "#84cc1620", label: "Light" },
  { max: 22, color: "#eab308", bg: "#eab30820", label: "Moderate" },
  { max: 30, color: "#f97316", bg: "#f9731620", label: "Fresh" },
  { max: Infinity, color: "#ef4444", bg: "#ef444420", label: "Strong" },
] as const;

function windColor(kt: number): string {
  return THRESHOLDS.find((t) => kt < t.max)?.color ?? "#ef4444";
}
function windLabel(kt: number): string {
  return THRESHOLDS.find((t) => kt < t.max)?.label ?? "Gale";
}
function kphToKt(kph: number | null): number | null {
  return kph != null ? kph * 0.54 : null;
}
function kphToMph(kph: number | null): number | null {
  return kph != null ? kph * 0.621 : null;
}
function cToF(c: number | null): number | null {
  return c != null ? (c * 9) / 5 + 32 : null;
}

// Wind direction arrow — rotated ↑ to point where wind blows TO.
function WindArrow({
  deg,
  color,
  size = 11,
}: {
  deg: number | null;
  color: string;
  size?: number;
}) {
  if (deg == null) return <span className="opacity-30">—</span>;
  const rotate = (deg + 180) % 360;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      style={{
        transform: `rotate(${rotate}deg)`,
        display: "inline-block",
        flexShrink: 0,
      }}
    >
      <line
        x1="5"
        y1="9"
        x2="5"
        y2="1.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <polyline
        points="2.5,4.5 5,1.5 7.5,4.5"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WindRow({
  label,
  kph,
  dirDeg,
  dir,
  gustKph,
  units,
}: {
  label: string;
  kph: number | null;
  dirDeg: number | null;
  dir: string | null;
  gustKph?: number | null;
  units: UnitSystem;
}) {
  const kt = kphToKt(kph);
  const color = kt != null ? windColor(kt) : "#555";
  const MAX_KT = 60;
  const barPct = kt != null ? Math.min(kt / MAX_KT, 1) * 100 : 0;

  let speedStr = "—";
  let gustStr: string | null = null;
  if (kph != null) {
    if (units === "imperial") {
      speedStr = `${Math.round(kphToMph(kph)!)} mph`;
      if (gustKph != null) gustStr = `gusts ${Math.round(kphToMph(gustKph)!)} mph`;
    } else {
      speedStr = `${Math.round(kph)} km/h`;
      if (gustKph != null) gustStr = `gusts ${Math.round(gustKph)} km/h`;
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-muted-foreground font-mono uppercase tracking-wider w-24 shrink-0">
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <WindArrow deg={dirDeg} color={color} />
          <span className="font-mono" style={{ color }}>
            {dir ? `${dir} ` : ""}
            {speedStr}
          </span>
          {gustStr && <span className="text-muted-foreground">({gustStr})</span>}
          <span
            className="text-[8px] font-bold ml-1 px-1 rounded"
            style={{
              color,
              background:
                THRESHOLDS.find((t) => (kt ?? 0) < t.max)?.bg ?? "#ef444420",
            }}
          >
            {kt != null ? windLabel(kt) : "—"}
          </span>
        </div>
      </div>
      <div
        className="relative h-3 rounded overflow-hidden"
        style={{ background: "#ffffff0a" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded transition-all duration-700"
          style={{
            width: `${barPct}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            boxShadow: `0 0 6px ${color}50`,
          }}
        />
        {[0, 20, 40, 60].map((tick) => (
          <div
            key={tick}
            className="absolute inset-y-0 w-px bg-white/10"
            style={{ left: `${(tick / MAX_KT) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function CloudIcon({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  if (pct < 10) return "☀️";
  if (pct < 30) return "🌤️";
  if (pct < 60) return "⛅";
  if (pct < 85) return "🌥️";
  return "☁️";
}

function overallCondition(weather: WeatherSummary): {
  label: string;
  color: string;
} {
  const winds = [
    kphToKt(weather.wind_kph),
    kphToKt(weather.w1000_kph),
    kphToKt(weather.w950_kph),
    kphToKt(weather.w925_kph),
    kphToKt(weather.w900_kph),
    kphToKt(weather.w850_kph),
    kphToKt(weather.w700_kph),
    kphToKt(weather.w600_kph),
  ].filter((v): v is number => v != null);

  const surfaceKt = kphToKt(weather.wind_kph) ?? 0;
  const gustKt = kphToKt(weather.gusts_kph) ?? 0;
  const maxKt = Math.max(...winds, gustKt);

  if (surfaceKt >= 25 || gustKt >= 30 || maxKt >= 50)
    return { label: "GROUNDED", color: "#ef4444" };
  if (surfaceKt >= 18 || gustKt >= 22 || maxKt >= 40)
    return { label: "MARGINAL", color: "#f97316" };
  if (surfaceKt >= 12 || gustKt >= 16 || maxKt >= 30)
    return { label: "CAUTION", color: "#eab308" };
  if (surfaceKt >= 6 || maxKt >= 15)
    return { label: "GOOD", color: "#84cc16" };
  return { label: "IDEAL", color: "#22c55e" };
}

export function WeatherCard({
  weather,
  loading,
  units,
}: {
  weather: WeatherSummary | null;
  loading: boolean;
  units: UnitSystem;
}) {
  if (loading) {
    return (
      <section className="border border-border rounded-lg p-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Weather at Jump
        </h3>
        <p className="text-xs text-muted-foreground animate-pulse">
          Fetching weather data…
        </p>
      </section>
    );
  }
  if (!weather) return null;

  const condition = overallCondition(weather);
  const tempVal =
    units === "imperial"
      ? `${Math.round(cToF(weather.temp_c)!)}°F`
      : `${Math.round(weather.temp_c ?? 0)}°C`;

  return (
    <section className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Weather at Jump
        </h3>
        <span
          className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
          style={{
            color: condition.color,
            background: condition.color + "20",
            border: `1px solid ${condition.color}40`,
          }}
        >
          {condition.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 pb-2 text-sm">
        <span className="font-bold text-foreground text-base">{tempVal}</span>
        {weather.cloud_pct != null && (
          <span>
            <CloudIcon pct={weather.cloud_pct} />{" "}
            {Math.round(weather.cloud_pct)}%
          </span>
        )}
        {weather.precip_mm != null && weather.precip_mm > 0 && (
          <span className="text-sky-400">
            🌧 {weather.precip_mm.toFixed(1)} mm
          </span>
        )}
      </div>

      <div className="px-4 pb-4 flex flex-col gap-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
          Wind Profile
        </p>
        <WindRow
          label="Surface"
          kph={weather.wind_kph}
          dirDeg={weather.wind_dir_deg}
          dir={weather.wind_dir}
          gustKph={weather.gusts_kph}
          units={units}
        />
        <WindRow
          label="~1,000 ft"
          kph={weather.w1000_kph}
          dirDeg={weather.w1000_dir_deg}
          dir={weather.w1000_dir}
          units={units}
        />
        <WindRow
          label="~1,600 ft"
          kph={weather.w950_kph}
          dirDeg={weather.w950_dir_deg}
          dir={weather.w950_dir}
          units={units}
        />
        <WindRow
          label="~2,600 ft"
          kph={weather.w925_kph}
          dirDeg={weather.w925_dir_deg}
          dir={weather.w925_dir}
          units={units}
        />
        <WindRow
          label="~3,300 ft"
          kph={weather.w900_kph}
          dirDeg={weather.w900_dir_deg}
          dir={weather.w900_dir}
          units={units}
        />
        <WindRow
          label="~5,000 ft"
          kph={weather.w850_kph}
          dirDeg={weather.w850_dir_deg}
          dir={weather.w850_dir}
          units={units}
        />
        <WindRow
          label="~10,000 ft"
          kph={weather.w700_kph}
          dirDeg={weather.w700_dir_deg}
          dir={weather.w700_dir}
          units={units}
        />
        <WindRow
          label="~14,000 ft"
          kph={weather.w600_kph}
          dirDeg={weather.w600_dir_deg}
          dir={weather.w600_dir}
          units={units}
        />

        <div className="relative mt-1" style={{ paddingLeft: 96 }}>
          <div className="flex justify-between text-[8px] text-muted-foreground font-mono">
            <span>0</span>
            <span>20 kt</span>
            <span>40 kt</span>
            <span>60 kt</span>
          </div>
          <div className="h-px bg-border mt-0.5" />
          <div className="flex mt-1 h-1 rounded overflow-hidden">
            <div style={{ flex: 8, background: "#22c55e" }} />
            <div style={{ flex: 7, background: "#84cc16" }} />
            <div style={{ flex: 7, background: "#eab308" }} />
            <div style={{ flex: 8, background: "#f97316" }} />
            <div style={{ flex: 30, background: "#ef4444" }} />
          </div>
          <div className="flex justify-between mt-0.5 text-[7px] text-muted-foreground">
            <span style={{ color: "#22c55e" }}>Calm</span>
            <span style={{ color: "#84cc16" }}>Light</span>
            <span style={{ color: "#eab308" }}>Moderate</span>
            <span style={{ color: "#f97316" }}>Fresh</span>
            <span style={{ color: "#ef4444" }}>Strong</span>
          </div>
        </div>
      </div>
    </section>
  );
}
