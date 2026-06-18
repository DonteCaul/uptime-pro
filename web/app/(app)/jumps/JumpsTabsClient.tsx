"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  MapPin,
  Pencil,
  Check,
  X,
  ChevronRight,
} from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { alt, speed, type UnitSystem } from "@/lib/units";
import { fmtDuration } from "@/lib/format";
import { encodeJumpId } from "@/lib/slug";
import dynamic from "next/dynamic";

// Mapbox touches window — load client-only, no SSR.
const JumpMap = dynamic(() => import("@/components/JumpMap"), {
  ssr: false,
  loading: () => (
    <div className="text-center text-muted-foreground py-10">Loading map…</div>
  ),
});

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

interface Cluster {
  lat: number | null;
  lon: number | null;
  jumps: JumpRow[];
  name: string | null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clusterJumps(jumps: JumpRow[], radiusKm = 5): Cluster[] {
  const withGps = jumps.filter(
    (j) => (j.dz_lat || j.exit_lat) && (j.dz_lon || j.exit_lon),
  );
  const noGps = jumps.filter((j) => !j.dz_lat && !j.exit_lat);
  const clusters: Cluster[] = [];
  for (const jump of withGps) {
    const lat = parseFloat(String(jump.dz_lat || jump.exit_lat));
    const lon = parseFloat(String(jump.dz_lon || jump.exit_lon));
    let added = false;
    for (const c of clusters) {
      if (c.lat && c.lon && haversineKm(lat, lon, c.lat, c.lon) <= radiusKm) {
        c.jumps.push(jump);
        added = true;
        break;
      }
    }
    if (!added) clusters.push({ lat, lon, jumps: [jump], name: null });
  }
  if (noGps.length)
    clusters.push({ lat: null, lon: null, jumps: noGps, name: "No GPS Data" });
  return clusters.sort((a, b) => b.jumps.length - a.jumps.length);
}

// Fetch nearby dropzones via the cached /api/places proxy.
async function fetchDropzonesInBbox(
  clusters: Cluster[],
): Promise<{ lat: number; lon: number; name: string }[]> {
  const gps = clusters.filter((c) => c.lat);
  if (!gps.length) return [];

  const seen = new Set<string>();
  const results: { lat: number; lon: number; name: string }[] = [];

  await Promise.all(
    gps.map(async (c) => {
      try {
        const res = await fetch(
          `/api/places/nearby?lat=${c.lat}&lon=${c.lon}&radius=16093`,
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const p of data.places ?? []) {
          if (p.lat == null || p.lon == null) continue;
          const key = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({ lat: p.lat, lon: p.lon, name: p.name ?? "" });
        }
      } catch {
        // ignore — fall back to geocoding
      }
    }),
  );

  return results;
}

// Reverse geocode via the cached /api/geocode proxy.
async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<string | null> {
  try {
    const res = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.name ?? null;
  } catch {
    return null;
  }
}

function JumpRowItem({
  jump,
  units,
}: {
  jump: JumpRow;
  units: UnitSystem;
}) {
  return (
    <Link
      href={`/jumps/${encodeJumpId(jump.id)}`}
      className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border last:border-0"
    >
      <div className="flex items-center gap-3 min-w-0">
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

function DropzoneCard({
  cluster,
  units,
}: {
  cluster: Cluster;
  units: UnitSystem;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const customNameKey =
    cluster.lat && cluster.lon
      ? `dz:${cluster.lat.toFixed(3)},${cluster.lon.toFixed(3)}`
      : null;
  // Load any user-saved custom name from localStorage lazily on first render.
  const [customName, setCustomName] = useState<string>(() => {
    if (typeof window === "undefined" || !customNameKey) return "";
    return localStorage.getItem(customNameKey) ?? "";
  });

  const displayName =
    customName ||
    cluster.name ||
    (cluster.lat && cluster.lon
      ? `${cluster.lat.toFixed(2)}°, ${cluster.lon.toFixed(2)}°`
      : "No GPS Data");

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }
  function save(e?: React.MouseEvent) {
    e?.stopPropagation();
    const val = inputRef.current?.value.trim() ?? "";
    setCustomName(val);
    if (cluster.lat && cluster.lon && val) {
      localStorage.setItem(
        `dz:${cluster.lat.toFixed(3)},${cluster.lon.toFixed(3)}`,
        val,
      );
    } else if (cluster.lat && cluster.lon) {
      localStorage.removeItem(
        `dz:${cluster.lat.toFixed(3)},${cluster.lon.toFixed(3)}`,
      );
    }
    setEditing(false);
  }
  function cancel(e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditing(false);
  }

  return (
    <Card className="group">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
          onClick={() => !editing && setOpen((o) => !o)}
        >
          <MapPin
            size={15}
            className={cn(
              "shrink-0",
              cluster.lat ? "text-primary" : "text-muted-foreground",
            )}
          />
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                ref={inputRef}
                defaultValue={displayName}
                className="text-sm font-semibold bg-input border border-border rounded px-2 py-0.5 w-full text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") cancel();
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <p className="text-sm font-semibold text-foreground truncate">
                {displayName}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {cluster.jumps.length} jump
              {cluster.jumps.length !== 1 ? "s" : ""}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {editing ? (
            <>
              <button
                onClick={save}
                className="p-1 text-primary hover:text-primary/80"
              >
                <Check size={14} />
              </button>
              <button
                onClick={cancel}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => setOpen((o) => !o)}
                className="p-1 text-muted-foreground"
              >
                {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </>
          )}
        </div>
      </div>
      {open && (
        <CardContent className="p-0 border-t border-border">
          {cluster.jumps.map((j) => (
            <JumpRowItem key={j.id} jump={j} units={units} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export function JumpsTabsClient({
  tab,
  units,
}: {
  tab: "dropzone" | "map";
  units: UnitSystem;
}) {
  const [allJumps, setAllJumps] = useState<JumpRow[] | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [geocoding, setGeocoding] = useState(false);

  // Fetch up to 1000 jumps for the current user (not global).
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("jumps")
        .select(
          "id, filename, jumped_at, exit_altitude_m, freefall_duration_s, max_freefall_speed_ms, exit_lat, exit_lon, dz_lat, dz_lon",
        )
        .eq("user_id", user.id)
        .order("jumped_at", { ascending: false, nullsFirst: false })
        .range(0, 999)
        .then(({ data }) => setAllJumps((data ?? []) as JumpRow[]));
    });
  }, []);

  // Dropzone tab: cluster + geocode once jumps load.
  useEffect(() => {
    if (tab !== "dropzone" || !allJumps) return;
    let cancelled = false;

    (async () => {
      const cs = clusterJumps(allJumps);
      // Show clusters immediately with placeholder names, then enrich.
      setGeocoding(true);
      setClusters(cs);

      const dzList = await fetchDropzonesInBbox(cs);
      if (cancelled) return;
      const radiusKm10 = 16.093; // 10 miles in km
      const names = await Promise.all(
        cs.map(async (c) => {
          if (!c.lat || !c.lon) return "No GPS Data";
          // Find nearest DZ within 10 miles.
          let best: { name: string; dist: number } | null = null;
          for (const dz of dzList) {
            const dist = haversineKm(c.lat, c.lon, dz.lat, dz.lon);
            if (dist <= radiusKm10 && (!best || dist < best.dist)) {
              best = { name: dz.name, dist };
            }
          }
          if (best) return best.name;
          return reverseGeocode(c.lat, c.lon);
        }),
      );
      if (cancelled) return;
      setClusters(
        cs.map((c, i) => ({
          ...c,
          name:
            names[i] ||
            (c.lat && c.lon
              ? `${c.lat.toFixed(2)}°, ${c.lon.toFixed(2)}°`
              : "No GPS Data"),
        })),
      );
      setGeocoding(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [allJumps, tab]);

  if (!allJumps) {
    return (
      <div className="text-center text-muted-foreground py-10">Loading…</div>
    );
  }

  if (tab === "map") {
    return (
      <div
        className="-mx-4 -mb-4 overflow-hidden"
        style={{ height: "calc(100vh - 176px)" }}
      >
        <JumpMap jumps={allJumps} theme="light" />
      </div>
    );
  }

  // Dropzone tab.
  if (clusters.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10">
        No jumps found.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {geocoding && (
        <p className="text-xs text-center text-muted-foreground">
          Locating dropzones…
        </p>
      )}
      {clusters.map((c, i) => (
        <DropzoneCard key={i} cluster={c} units={units} />
      ))}
    </div>
  );
}
