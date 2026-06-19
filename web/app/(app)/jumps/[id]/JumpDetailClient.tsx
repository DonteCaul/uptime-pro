"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { smoothTrack } from "@/lib/smooth";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Layers,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { TelemetryChart } from "@/components/TelemetryChart";
import { WeatherCard } from "@/components/WeatherCard";
import { alt, speed, gpsSpeed, type UnitSystem } from "@/lib/units";
import { useUnits } from "@/lib/useUnits";
import { fmtDuration } from "@/lib/format";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { encodeJumpId } from "@/lib/slug";

// DeviceMode: 2=climb, 3=freefall, 4=canopy, 5=ground
const PHASE_COLOR: Record<number, string> = {
  2: "#00cc55",
  3: "#ff3333",
  4: "#3399ff",
  5: "#888888",
};
const PHASE_LABEL: Record<number, string> = {
  2: "Climbing",
  3: "Freefall",
  4: "Under Canopy",
  5: "Ground",
};

function getPhase(pt: TrackPoint | null): number {
  return pt?.device_mode ?? 5;
}

function fmtTime(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return "0:00.0";
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = (total % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

const PLAYBACK_SPEEDS = [1, 5, 10, 30, 100];

interface JumpDetail {
  id: number;
  filename: string;
  jumped_at: string | null;
  exit_altitude_m: number | null;
  deployment_altitude_m: number | null;
  freefall_duration_s: number | null;
  max_freefall_speed_ms: number | null;
  canopy_duration_s: number | null;
  climb_duration_s: number | null;
  jump_number: number | null;
  exit_lat: number | null;
  exit_lon: number | null;
  notes: string | null;
  discipline: string | null;
  is_public: boolean;
  row_count: number | null;
  prev_id: number | null;
  next_id: number | null;
}

interface TrackPoint {
  sample_ms: number | null;
  device_mode: number | null;
  gps_lat: number | null;
  gps_lon: number | null;
  gps_altitude_m: number | null;
  altitude_m: number | null;
  altitude_above_ground_m: number | null;
  inst_vert_speed_ms: number | null;
  gps_speed_knot: number | null;
  gps_angle_deg: number | null;
  accel_x: number | string | null;
  accel_y: number | string | null;
  accel_z: number | string | null;
  temperature_c: number | null;
  batt_perc: number | null;
}

interface Analysis {
  avgGlide: number | null;
  landingKt: number | null;
  isSwoop: boolean;
  swoopKt: number;
  peakG: number | null;
  avgG: number | null;
  avgFF: number | null;
}

interface WeatherSummary {
  temp_c: number | null;
  wind_kph: number | null;
  wind_dir_deg: number | null;
  wind_dir: string | null;
  gusts_kph: number | null;
  cloud_pct: number | null;
  precip_mm: number | null;
  w1000_kph: number | null;
  w1000_dir_deg: number | null;
  w1000_dir: string | null;
  w950_kph: number | null;
  w950_dir_deg: number | null;
  w950_dir: string | null;
  w925_kph: number | null;
  w925_dir_deg: number | null;
  w925_dir: string | null;
  w900_kph: number | null;
  w900_dir_deg: number | null;
  w900_dir: string | null;
  w850_kph: number | null;
  w850_dir_deg: number | null;
  w850_dir: string | null;
  w700_kph: number | null;
  w700_dir_deg: number | null;
  w700_dir: string | null;
  w600_kph: number | null;
  w600_dir_deg: number | null;
  w600_dir: string | null;
  w500_kph: number | null;
  w500_dir_deg: number | null;
  w500_dir: string | null;
}

function StatChip({
  label,
  value,
  accent,
  onClick,
}: {
  label: string;
  value: string | null;
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center rounded-md px-3 py-2 min-w-[80px] shrink-0 border border-border transition-colors",
        onClick && "cursor-pointer hover:bg-accent/60 active:scale-95",
      )}
      style={
        accent
          ? {
              borderColor: `${accent}40`,
              background: `${accent}0a`,
            }
          : undefined
      }
    >
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground leading-none mb-1">
        {label}
      </span>
      <span
        className="text-sm font-bold font-mono tabular-nums leading-none"
        style={accent ? { color: accent } : undefined}
      >
        {value ?? "—"}
      </span>
    </button>
  );
}

export function JumpDetailClient({
  jump: initialJump,
  track: initialTrack,
  weather,
  units: serverUnits,
}: {
  jump: JumpDetail;
  track: TrackPoint[];
  weather: WeatherSummary | null;
  units: UnitSystem;
}) {
  const router = useRouter();
  const units = useUnits(serverUnits);
  const [jump] = useState(initialJump);

  // Smooth telemetry: median-filter vertical speed + altitude, clamp per-phase spikes.
  const track = useMemo(() => smoothTrack(initialTrack), [initialTrack]);

  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(30);
  const [notes, setNotes] = useState(initialJump.notes ?? "");
  const [discipline, setDiscipline] = useState(initialJump.discipline ?? "");
  const [isPublic, setIsPublic] = useState(initialJump.is_public ?? true);
  const [jumpRunBearing, setJumpRunBearing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [terrain3d, setTerrain3d] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRafTime = useRef<number | null>(null);

  // ── Build Mapbox once track is ready ──────────────────────────────────────
  useEffect(() => {
    if (!track.length || !mapContainerRef.current || mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    const valid = track.filter(
      (p) => p.gps_lat && p.gps_lon && Math.abs(p.gps_lat) > 1,
    );
    if (!valid.length) return;

    mapboxgl.accessToken = token;

    const features: {
      type: "Feature";
      properties: { color: string };
      geometry: { type: "LineString"; coordinates: [number, number][] };
    }[] = [];
    for (let i = 1; i < valid.length; i++) {
      const a = valid[i - 1];
      const b = valid[i];
      features.push({
        type: "Feature" as const,
        properties: { color: PHASE_COLOR[getPhase(a)] ?? "#888" },
        geometry: {
          type: "LineString",
          coordinates: [
            [a.gps_lon!, a.gps_lat!],
            [b.gps_lon!, b.gps_lat!],
          ],
        },
      });
    }

    const bounds = valid.reduce(
      (b, p) => b.extend([p.gps_lon!, p.gps_lat!]),
      new mapboxgl.LngLatBounds(
        [valid[0].gps_lon!, valid[0].gps_lat!],
        [valid[0].gps_lon!, valid[0].gps_lat!],
      ),
    );

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      bounds,
      fitBoundsOptions: { padding: 40 },
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });

      map.addSource("track", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });
      map.addLayer({
        id: "track-line",
        type: "line",
        source: "track",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3,
          "line-opacity": 0.9,
        },
      });

      // ── Jump run heading indicator ──────────────────────────────────────────
      try {
        const climbPts = valid.filter((p) => p.device_mode === 2);
        if (climbPts.length >= 2) {
          const tail = climbPts.slice(-20);
          const exitPt = tail[tail.length - 1];
          const refPt = tail[0];

          const lat1 = +refPt.gps_lat!;
          const lon1 = +refPt.gps_lon!;
          const lat2 = +exitPt.gps_lat!;
          const lon2 = +exitPt.gps_lon!;

          if (
            !isNaN(lat1) &&
            !isNaN(lon1) &&
            !isNaN(lat2) &&
            !isNaN(lon2)
          ) {
            const dLon =
              (lon2 - lon1) * Math.cos((lat2 * Math.PI) / 180);
            const dLat = lat2 - lat1;
            const bearingDeg =
              ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;

            const RAD = Math.PI / 180;
            const len = 0.036; // ~2.5 miles forward
            const endLat = lat2 + len * Math.cos(bearingDeg * RAD);
            const endLon = lon2 + len * Math.sin(bearingDeg * RAD);

            map.addSource("jump-run", {
              type: "geojson",
              data: {
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [lon2, lat2],
                    [endLon, endLat],
                  ],
                },
              },
            });
            map.addLayer({
              id: "jump-run-line",
              type: "line",
              source: "jump-run",
              paint: {
                "line-color": "#facc15",
                "line-width": 2.5,
                "line-opacity": 0.95,
              },
            });

            const arrowEl = document.createElement("div");
            arrowEl.style.cssText = [
              "width:0;height:0",
              "border-left:7px solid transparent",
              "border-right:7px solid transparent",
              "border-top:16px solid #facc15",
              "filter:drop-shadow(0 0 3px rgba(0,0,0,0.7))",
              `transform:rotate(${bearingDeg - 180}deg)`,
              "transform-origin:center top",
            ].join(";");
            new mapboxgl.Marker({ element: arrowEl, anchor: "top" })
              .setLngLat([endLon, endLat])
              .addTo(map);

            const dot = document.createElement("div");
            dot.style.cssText =
              "width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid rgba(0,0,0,0.5);box-shadow:0 0 4px rgba(0,0,0,0.6)";
            new mapboxgl.Marker({ element: dot, anchor: "center" })
              .setLngLat([lon2, lat2])
              .addTo(map);

            setJumpRunBearing(Math.round(bearingDeg));
          }
        }
      } catch (err) {
        console.error("Jump run indicator error:", err);
      }

      try {
        map.addLayer({
          id: "sky",
          type: "sky",
          paint: {
            "sky-type": "atmosphere",
            "sky-atmosphere-sun": [0, 90],
            "sky-atmosphere-sun-intensity": 15,
          },
        });
      } catch (err) {
        console.warn("Sky layer not supported:", err);
      }

      new mapboxgl.Marker({ color: "#00cc55" })
        .setLngLat([valid[0].gps_lon!, valid[0].gps_lat!])
        .addTo(map);
      new mapboxgl.Marker({ color: "#3399ff" })
        .setLngLat([
          valid[valid.length - 1].gps_lon!,
          valid[valid.length - 1].gps_lat!,
        ])
        .addTo(map);

      const el = document.createElement("div");
      el.style.cssText =
        "width:14px;height:14px;border-radius:50%;background:#FFDD00;border:2px solid #fff;box-shadow:0 0 8px rgba(0,0,0,.7)";
      markerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([valid[0].gps_lon!, valid[0].gps_lat!])
        .addTo(map);

      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [track]);

  // 3D terrain toggle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (terrain3d) {
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
      map.easeTo({ pitch: 60, bearing: -20, duration: 800 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    }
  }, [terrain3d, mapReady]);

  // Move map marker on cursor change.
  useEffect(() => {
    if (!markerRef.current || !track.length) return;
    const pt = track[cursor];
    if (pt?.gps_lat && pt?.gps_lon && Math.abs(pt.gps_lat) > 1) {
      markerRef.current.setLngLat([pt.gps_lon, pt.gps_lat]);
    }
  }, [cursor, track]);

  // Time-based RAF playback. Defined inside the effect so it closes over the
  // current track + speed and self-schedules via rafRef.
  useEffect(() => {
    if (!playing || !track.length) return;

    lastRafTime.current = null;
    const animate = (now: number) => {
      if (lastRafTime.current === null) lastRafTime.current = now;
      const realDelta = now - lastRafTime.current;
      lastRafTime.current = now;

      setCursor((c) => {
        if (c >= track.length - 1) {
          setPlaying(false);
          return c;
        }
        const dataDelta = realDelta * playbackSpeed;
        const targetMs = (track[c].sample_ms ?? 0) + dataDelta;
        let next = c;
        while (next < track.length - 1 && (track[next].sample_ms ?? 0) < targetMs)
          next++;
        return next;
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, track, playbackSpeed]);

  // Analysis (canopy, freefall, swoop) — derived from track.
  const analysis = useMemo<Analysis | null>(() => {
    if (!track.length) return null;

    const ffPts = track.filter((p) => p.device_mode === 3);
    const canopyPts = track.filter((p) => p.device_mode === 4);

    const toNum = (v: number | string | null | undefined): number | null =>
      v == null ? null : +v;

    // Avg glide ratio during canopy.
    const glides = canopyPts
      .filter((p) => Math.abs(toNum(p.inst_vert_speed_ms) ?? 0) > 0.5)
      .map(
        (p) =>
          ((toNum(p.gps_speed_knot) ?? 0) * 0.514) /
          Math.abs(toNum(p.inst_vert_speed_ms)!),
      );
    const avgGlide = glides.length
      ? glides.reduce((s, v) => s + v, 0) / glides.length
      : null;

    // Landing speed.
    const last10 = canopyPts
      .slice(-10)
      .filter(
        (p) =>
          toNum(p.gps_speed_knot) != null && isFinite(toNum(p.gps_speed_knot)!),
      );
    const landingKt = last10.length
      ? last10.reduce((s, p) => s + toNum(p.gps_speed_knot)!, 0) / last10.length
      : null;

    // Swoop.
    const veryLowAlt = canopyPts.filter(
      (p) => (toNum(p.altitude_above_ground_m) ?? 0) < 30,
    );
    const swoopKt = veryLowAlt.length
      ? Math.max(...veryLowAlt.map((p) => toNum(p.gps_speed_knot) ?? 0))
      : 0;
    const isSwoop = swoopKt > 40;

    // Peak G at deployment.
    const deployIdx = track.findIndex((p) => p.device_mode === 4);
    const openWindow = 30;
    const openPts =
      deployIdx >= 0 ? track.slice(deployIdx, deployIdx + openWindow) : [];
    const gMag = (p: TrackPoint) =>
      Math.sqrt(
        (toNum(p.accel_x) || 0) ** 2 +
          (toNum(p.accel_y) || 0) ** 2 +
          (toNum(p.accel_z) || 0) ** 2,
      ) / 7500;
    const peakG = openPts.length ? Math.max(...openPts.map(gMag)) : null;

    // Avg G-force throughout freefall + canopy, excluding opening window.
    const jumpPts = track.filter((p, i) => {
      const inJump = p.device_mode === 3 || p.device_mode === 4;
      const inOpenWindow =
        deployIdx >= 0 && i >= deployIdx && i < deployIdx + openWindow;
      return inJump && !inOpenWindow;
    });
    const avgG = jumpPts.length
      ? jumpPts.reduce((s, p) => s + gMag(p), 0) / jumpPts.length
      : null;

    // Avg freefall vert speed.
    const avgFF = ffPts.length
      ? ffPts.reduce(
          (s, p) => s + Math.abs(toNum(p.inst_vert_speed_ms) ?? 0),
          0,
        ) / ffPts.length
      : null;

    return { avgGlide, landingKt, isSwoop, swoopKt, peakG, avgG, avgFF };
  }, [track]);

  // ── Key event track indices (for clickable stat chips) ──────────────────
  const eventIndices = useMemo(() => {
    const toNum = (v: number | string | null | undefined): number | null =>
      v == null ? null : +v;

    // Exit: highest altitude point
    let exitIdx = 0;
    let maxAlt = -Infinity;
    for (let i = 0; i < track.length; i++) {
      const a = toNum(track[i].altitude_m);
      if (a != null && a > maxAlt) { maxAlt = a; exitIdx = i; }
    }

    // Deploy: first canopy-mode row after freefall
    let deployIdx = -1;
    let ffStarted = false;
    for (let i = 0; i < track.length; i++) {
      if (track[i].device_mode === 3) ffStarted = true;
      if (ffStarted && track[i].device_mode === 4) { deployIdx = i; break; }
    }

    // Max speed: absolute max vertical speed during freefall
    let maxSpeedIdx = 0;
    let maxSpeedVal = -Infinity;
    for (let i = 0; i < track.length; i++) {
      if (track[i].device_mode !== 3) continue;
      const v = Math.abs(toNum(track[i].inst_vert_speed_ms) ?? 0);
      if (v > maxSpeedVal) { maxSpeedVal = v; maxSpeedIdx = i; }
    }

    // Open G: peak G-force within 30-sample window around deployment
    const gMag = (p: TrackPoint) =>
      Math.sqrt(
        (toNum(p.accel_x) || 0) ** 2 +
          (toNum(p.accel_y) || 0) ** 2 +
          (toNum(p.accel_z) || 0) ** 2,
      ) / 7500;
    let peakGIdx = deployIdx >= 0 ? deployIdx : 0;
    let peakGVal = -Infinity;
    const openEnd = Math.min(track.length, (deployIdx >= 0 ? deployIdx : 0) + 30);
    for (let i = deployIdx >= 0 ? deployIdx : 0; i < openEnd; i++) {
      const g = gMag(track[i]);
      if (g > peakGVal) { peakGVal = g; peakGIdx = i; }
    }

    return { exitIdx, deployIdx, maxSpeedIdx, peakGIdx };
  }, [track]);

  const currentPt = track[cursor] ?? null;
  const phase = getPhase(currentPt);
  const phaseColor = PHASE_COLOR[phase] ?? "#888";

  const relMs =
    track.length > 1 ? (track[cursor]?.sample_ms ?? 0) - (track[0].sample_ms ?? 0) : 0;
  const totalMs =
    track.length > 1
      ? (track[track.length - 1].sample_ms ?? 0) - (track[0].sample_ms ?? 0)
      : 0;
  const pct = totalMs ? (relMs / totalMs) * 100 : 0;

  // Phase-colored segments for the scrubber progress bar.
  const scrubberPhaseSegments = useMemo(() => {
    if (!track.length) return [];
    const regions: { x1: number; width: number; color: string }[] = [];
    let start = 0;
    let mode = track[0].device_mode ?? 5;
    for (let i = 1; i <= track.length; i++) {
      const m = i < track.length ? (track[i].device_mode ?? 5) : -1;
      if (m !== mode) {
        const x1 = (start / Math.max(track.length - 1, 1)) * 100;
        const x2 = ((i - 1) / Math.max(track.length - 1, 1)) * 100;
        regions.push({ x1, width: x2 - x1, color: PHASE_COLOR[mode] ?? "#888" });
        start = i;
        mode = m;
      }
    }
    return regions;
  }, [track]);

  const date = jump.jumped_at
    ? new Date(jump.jumped_at).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  async function handleSave() {
    setSaving(true);
    const supabase = createBrowserSupabaseClient();
    await supabase
      .from("jumps")
      .update({ notes, discipline: discipline || null, is_public: isPublic })
      .eq("id", jump.id);
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this jump and all its sensor data?")) return;
    const supabase = createBrowserSupabaseClient();
    await supabase.from("jumps").delete().eq("id", jump.id);
    router.push("/jumps");
  }

  return (
    <div className="flex flex-col min-h-screen bg-background pb-16">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-primary text-sm hover:underline shrink-0"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">
            {jump.jump_number != null ? `#${jump.jump_number}` : ""}{jump.jump_number != null && date ? " " : ""}{date || jump.filename}
          </p>
          <p className="text-[10px] text-muted-foreground truncate leading-none mt-0.5">
            {jump.filename}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              if (jump.prev_id) window.location.href = `/jumps/${encodeJumpId(jump.prev_id)}`;
            }}
            disabled={!jump.prev_id}
            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous jump"
          >
            <ChevronLeft size={16} className="text-foreground" />
          </button>
          <button
            onClick={() => {
              if (jump.next_id) window.location.href = `/jumps/${encodeJumpId(jump.next_id)}`;
            }}
            disabled={!jump.next_id}
            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Next jump"
          >
            <ChevronRight size={16} className="text-foreground" />
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
        <StatChip
          label="Exit Alt"
          value={alt(jump.exit_altitude_m, units)}
          accent="#00cc55"
          onClick={() => setCursor(eventIndices.exitIdx)}
        />
        <StatChip
          label="FF Time"
          value={fmtDuration(jump.freefall_duration_s)}
          accent="#ff3333"
        />
        <StatChip
          label="Max Speed"
          value={speed(jump.max_freefall_speed_ms, units)}
          accent="#ff3333"
          onClick={() => setCursor(eventIndices.maxSpeedIdx)}
        />
        <StatChip
          label="Deploy Alt"
          value={alt(jump.deployment_altitude_m, units)}
          accent="#3399ff"
          onClick={() => setCursor(eventIndices.deployIdx)}
        />
        <StatChip
          label="Canopy"
          value={fmtDuration(jump.canopy_duration_s)}
          accent="#3399ff"
        />
        {jump.climb_duration_s != null && (
          <StatChip
            label="Climb"
            value={fmtDuration(jump.climb_duration_s)}
            accent="#888888"
          />
        )}
        {analysis?.avgGlide != null && (
          <StatChip
            label="Glide"
            value={`${analysis.avgGlide.toFixed(1)}:1`}
            accent="#3399ff"
          />
        )}
        {analysis?.isSwoop && (
          <StatChip
            label="Peak Swoop"
            value={gpsSpeed(analysis.swoopKt, units)}
            accent="#FFD700"
          />
        )}
        {analysis?.peakG != null && (
          <StatChip
            label="Open G"
            value={`${analysis.peakG.toFixed(1)}G`}
            accent="#C084FC"
            onClick={() => setCursor(eventIndices.peakGIdx)}
          />
        )}
        {analysis?.avgG != null && (
          <StatChip
            label="Avg G"
            value={`${analysis.avgG.toFixed(2)}G`}
            accent="#C084FC"
          />
        )}
      </div>

      {/* Map */}
      <div
        className="relative mx-4 rounded-lg overflow-hidden border border-border"
        style={{ height: 420 }}
      >
        <div ref={mapContainerRef} className="mapbox-no-logo" style={{ width: "100%", height: "100%" }} />

        {mapReady && (
          <div
            className="absolute top-2 left-2 z-10 pointer-events-none"
            style={{ width: 48, height: 48 }}
          >
            <svg viewBox="0 0 48 48" width="48" height="48">
              <polygon points="24,4 20,24 24,20 28,24" fill="#ef4444" />
              <polygon points="24,44 20,24 24,28 28,24" fill="white" />
              <polygon points="44,24 24,20 28,24 24,28" fill="white" />
              <polygon points="4,24 24,20 20,24 24,28" fill="white" />
              <circle cx="24" cy="24" r="3" fill="#1a1a1a" />
              <text
                x="24"
                y="3"
                textAnchor="middle"
                fill="#ef4444"
                fontSize="7"
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                N
              </text>
              <text
                x="24"
                y="48"
                textAnchor="middle"
                fill="white"
                fontSize="7"
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                S
              </text>
              <text
                x="47"
                y="26"
                textAnchor="middle"
                fill="white"
                fontSize="7"
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                E
              </text>
              <text
                x="1"
                y="26"
                textAnchor="middle"
                fill="white"
                fontSize="7"
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                W
              </text>
            </svg>
          </div>
        )}

        {mapReady && (
          <button
            onClick={() => setTerrain3d((v) => !v)}
            className={cn(
              "absolute top-2 right-2 z-10 flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold shadow-lg transition-colors",
              terrain3d
                ? "bg-primary text-primary-foreground"
                : "bg-black/60 text-white border border-white/20 hover:bg-black/80",
            )}
          >
            <Layers size={12} /> {terrain3d ? "3D" : "2D"}
          </button>
        )}

        {mapReady && (
          <div className="absolute bottom-2 left-2 flex gap-2 flex-wrap bg-black/60 rounded px-2 py-1">
            {Object.entries(PHASE_LABEL)
              .filter(([m]) => m !== "5")
              .map(([m, label]) => (
                <div
                  key={m}
                  className="flex items-center gap-1 text-[9px] text-white/80"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: PHASE_COLOR[+m] }}
                  />
                  {label}
                </div>
              ))}
            {jumpRunBearing !== null && (
              <div className="flex items-center gap-1 text-[9px] text-white/80">
                <span className="inline-block w-4 border-t-2 border-yellow-400" />
                Jump Run {jumpRunBearing}°
              </div>
            )}
          </div>
        )}

        {!track.length && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm bg-background/80">
            {jump.row_count ? "Loading track…" : "No GPS data"}
          </div>
        )}
      </div>

      {/* Telemetry chart strip */}
      {track.length > 0 && (
        <div className="mx-4 mt-3 relative">
          <TelemetryChart
            points={track}
            cursor={cursor}
            onCursor={(idx) => {
              setPlaying(false);
              setCursor(idx);
            }}
            units={units}
          />
        </div>
      )}

      {/* Scrubber / playback */}
      {track.length > 0 && (
        <div className="mx-4 mt-3 border border-border rounded-lg overflow-hidden">
          <div className="relative h-1.5 bg-muted">
            {scrubberPhaseSegments.map((r, i) => (
              <div
                key={i}
                className="absolute inset-y-0 opacity-60"
                style={{
                  left: `${r.x1}%`,
                  width: `${r.width}%`,
                  background: r.color,
                }}
              />
            ))}
            <div
              className="absolute inset-y-0 w-0.5 bg-white shadow-md"
              style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
            />
          </div>

          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => {
                  setCursor(0);
                  setPlaying(false);
                }}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <SkipBack size={14} />
              </button>
              <button
                onClick={() => setPlaying((p) => !p)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-primary-foreground transition-colors shrink-0"
                style={{ background: phaseColor }}
              >
                {playing ? (
                  <Pause size={13} />
                ) : (
                  <Play size={13} className="ml-0.5" />
                )}
              </button>
              <button
                onClick={() => {
                  setCursor(track.length - 1);
                  setPlaying(false);
                }}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <SkipForward size={14} />
              </button>
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <span
                className="text-[9px] font-bold uppercase tracking-wider leading-none"
                style={{ color: phaseColor }}
              >
                {PHASE_LABEL[phase] ?? "Ground"}
              </span>
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground leading-tight whitespace-nowrap">
                {fmtTime(relMs)} / {fmtTime(totalMs)}
              </span>
            </div>

            <div className="flex gap-0.5 shrink-0">
              {PLAYBACK_SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setPlaybackSpeed(s)}
                  className={cn(
                    "text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors",
                    playbackSpeed === s
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          <div className="px-3 pb-2">
            <input
              type="range"
              min={0}
              max={track.length - 1}
              value={cursor}
              onChange={(e) => {
                setPlaying(false);
                setCursor(Number(e.target.value));
              }}
              className="w-full accent-primary h-1"
            />
          </div>

          <div className="grid grid-cols-4 divide-x divide-border border-t border-border">
            {[
              {
                label: "Alt AGL",
                val: alt(
                  currentPt?.altitude_above_ground_m ?? currentPt?.altitude_m,
                  units,
                ),
              },
              {
                label: "Vert Spd",
                val: speed(currentPt?.inst_vert_speed_ms, units),
              },
              {
                label: "GPS Spd",
                val: gpsSpeed(currentPt?.gps_speed_knot, units),
              },
              {
                label: "Heading",
                val:
                  currentPt?.gps_angle_deg != null
                    ? `${Math.round(currentPt.gps_angle_deg)}°`
                    : "—",
              },
            ].map(({ label, val }) => (
              <div
                key={label}
                className="flex flex-col items-center py-2"
              >
                <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
                  {label}
                </span>
                <span className="text-xs font-bold font-mono tabular-nums text-foreground">
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis */}
      {analysis && (
        <div className="mx-4 mt-3 border border-border rounded-lg p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Jump Analysis
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {analysis.avgFF != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Freefall Spd</span>
                <span className="font-mono font-bold text-foreground">
                  {speed(analysis.avgFF, units)}
                </span>
              </div>
            )}
            {analysis.avgGlide != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Glide Ratio</span>
                <span className="font-mono font-bold text-foreground">
                  {analysis.avgGlide.toFixed(1)}:1
                </span>
              </div>
            )}
            {analysis.landingKt != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Landing Speed</span>
                <span className="font-mono font-bold text-foreground">
                  {gpsSpeed(analysis.landingKt, units)}
                </span>
              </div>
            )}
            {analysis.peakG != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opening G-force</span>
                <span
                  className="font-mono font-bold"
                  style={{ color: "#C084FC" }}
                >
                  {analysis.peakG.toFixed(2)}G
                </span>
              </div>
            )}
            {analysis.avgG != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg G-force</span>
                <span
                  className="font-mono font-bold"
                  style={{ color: "#C084FC" }}
                >
                  {analysis.avgG.toFixed(2)}G
                </span>
              </div>
            )}
            {analysis.isSwoop && (
              <div className="col-span-2 flex items-center gap-2 mt-1 pt-2 border-t border-border">
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
                  style={{
                    background: "#FFD70020",
                    color: "#FFD700",
                    border: "1px solid #FFD70040",
                  }}
                >
                  Swoop Detected
                </span>
                <span className="text-muted-foreground">
                  Peak {gpsSpeed(analysis.swoopKt, units)} under 100m AGL
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Weather */}
      <div className="mx-4 mt-3">
        <WeatherCard weather={weather} loading={false} units={units} />
      </div>

      {/* Discipline & Notes */}
      <div className="mx-4 mt-3 border border-border rounded-lg p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Discipline
          </label>
          <select
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
            className="w-full rounded-md border border-border bg-input text-foreground text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— Select discipline —</option>
            {[
              "Angle",
              "Freefly",
              "FS / Flat",
              "Wingsuit",
              "Hop and Pop",
              "CRW",
              "XRW",
              "Tandem",
              "Speed",
              "AFF Instructor",
              "Classic Accuracy",
              "Angle - Head Up",
              "Tracking",
              "AFF Video",
              "Student",
              "Static Line",
              "Canopy Piloting / Swooping",
              "BASE",
              "Other",
            ].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Notes
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add notes about this jump…"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Visibility
            </label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isPublic
                ? "Visible on your public profile"
                : "Private — only you can see this jump"}
            </p>
          </div>
          <Switch
            checked={isPublic}
            onCheckedChange={setIsPublic}
          />
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="self-end"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Delete */}
      <div className="mx-4 mt-3">
        <Button
          variant="ghost"
          className="w-full text-destructive hover:bg-destructive/10"
          onClick={handleDelete}
        >
          Delete this jump
        </Button>
      </div>
    </div>
  );
}
