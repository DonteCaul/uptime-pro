"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LeaderboardData } from "./page";

const PERIODS = [
  { value: "day", label: "Today" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All Time" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

interface BaseUser {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

function Avatar({ user, size = 32 }: { user: BaseUser; size?: number }) {
  if (user.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatar_url}
        alt={user.full_name ?? "avatar"}
        className="rounded-full object-cover border border-border shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {(user.full_name || "?")[0]?.toUpperCase()}
    </div>
  );
}

function LeaderRow({
  rank,
  user,
  stat,
  label,
}: {
  rank: number;
  user: BaseUser;
  stat: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <span
        className={cn(
          "w-6 text-center text-sm font-bold shrink-0",
          rank <= 3 ? "text-primary" : "text-muted-foreground",
        )}
      >
        {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
      </span>
      <Avatar user={user} size={32} />
      <div className="flex-1 min-w-0">
        <Link
          href={`/u/${user.id}`}
          className="text-sm font-medium text-foreground hover:text-primary hover:underline truncate block"
        >
          {user.full_name || "Anonymous"}
        </Link>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-foreground">{stat}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

interface HomeDzUser {
  id: string;
  full_name: string | null;
  home_dz: string | null;
  home_dz_lat: string | null;
  home_dz_lon: string | null;
}

function HomeDzGlobe({ users }: { users: HomeDzUser[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!containerRef.current || !token || mapRef.current) return;

    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = token;

      const valid = users.filter(
        (u) => u.home_dz_lat && u.home_dz_lon,
      );
      const features = valid.map((u) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [
            parseFloat(u.home_dz_lon!),
            parseFloat(u.home_dz_lat!),
          ],
        },
        properties: {
          name: u.full_name ?? "Anonymous",
          dz: u.home_dz ?? "",
        },
      }));

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        // `projection` accepts a string in GL JS v3+; the types lag.
        ...({ projection: "globe" } as Record<string, unknown>),
        zoom: 1.5,
        center: [0, 20],
      });
      mapRef.current = map;

      map.on("load", () => {
        try {
          map.setFog({});
        } catch {
          // older mapbox versions
        }

        map.addSource("home-dzs", {
          type: "geojson",
          data: { type: "FeatureCollection", features },
        });

        if (features.length === 1) {
          map.flyTo({
            center: features[0].geometry.coordinates as [number, number],
            zoom: 9,
            speed: 1.2,
          });
        } else if (features.length > 1) {
          const lngs = features.map(
            (f) => f.geometry.coordinates[0],
          );
          const lats = features.map(
            (f) => f.geometry.coordinates[1],
          );
          map.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: 80, maxZoom: 8 },
          );
        }

        map.addLayer({
          id: "home-dzs-points",
          type: "circle",
          source: "home-dzs",
          paint: {
            "circle-radius": 7,
            "circle-color": "#3b82f6",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });

        map.on("click", "home-dzs-points", (e) => {
          const rawFeature = e.features?.[0];
          if (!rawFeature) return;
          // mapbox-gl types lag on properties/geometry access; cast.
          const feature = rawFeature as unknown as {
            properties: Record<string, unknown>;
            geometry: { coordinates: [number, number] };
          };
          const props = feature.properties ?? {};
          const coords = feature.geometry.coordinates;
          new mapboxgl.Popup()
            .setLngLat(coords)
            .setHTML(
              `<strong>${props.name ?? "Anonymous"}</strong>${props.dz ? `<br/>${props.dz}` : ""}`,
            )
            .addTo(map);
        });

        map.on("mouseenter", "home-dzs-points", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "home-dzs-points", () => {
          map.getCanvas().style.cursor = "";
        });
      });
    })();

    return () => {
      cancelled = true;
      const map = mapRef.current as { remove?: () => void } | null;
      if (map?.remove) map.remove();
      mapRef.current = null;
    };
  }, [users]);

  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 h-48 flex items-center justify-center text-sm text-muted-foreground">
        Map requires NEXT_PUBLIC_MAPBOX_TOKEN
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-border overflow-hidden"
      style={{ height: 360 }}
    />
  );
}

export function SocialClient({
  dataByPeriod,
}: {
  dataByPeriod: Record<string, LeaderboardData>;
}) {
  const [period, setPeriod] = useState<Period>("all");
  const data = dataByPeriod[period] ?? dataByPeriod.all;

  const jumpLeaders = data?.jumps ?? [];
  const dzLeaders = data?.dzs ?? [];
  const discLeaders = data?.disciplines ?? [];
  const homeDzUsers = data?.homeDzs ?? [];

  // Group discipline leaders: top user(s) per discipline.
  const discMap = new Map<string, typeof discLeaders>();
  for (const r of discLeaders) {
    const key = r.discipline || "Unknown";
    if (!discMap.has(key)) discMap.set(key, []);
    discMap.get(key)!.push(r);
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">Social</h2>
        <p className="text-muted-foreground text-sm">Community leaderboards</p>
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.value}
            size="sm"
            variant={period === p.value ? "default" : "outline"}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Jump leaderboard */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Most Jumps</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {jumpLeaders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No public data yet
            </p>
          ) : (
            jumpLeaders.map((u, i) => (
              <LeaderRow
                key={u.id}
                rank={i + 1}
                user={u}
                stat={u.jump_count}
                label="jumps"
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* DZ leaderboard */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Most Dropzones Visited</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {dzLeaders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No public data yet
            </p>
          ) : (
            dzLeaders.map((u, i) => (
              <LeaderRow
                key={u.id}
                rank={i + 1}
                user={u}
                stat={u.dz_count}
                label="DZs"
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Discipline leaderboards */}
      {discMap.size > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Most Jumps by Discipline</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {Array.from(discMap.entries()).map(([disc, leaders]) => (
              <div key={disc} className="mb-4 last:mb-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  {disc}
                </p>
                {leaders.slice(0, 3).map((u, i) => (
                  <LeaderRow
                    key={`${disc}-${u.id}`}
                    rank={i + 1}
                    user={u}
                    stat={u.jump_count}
                    label="jumps"
                  />
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Home DZ globe */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Home Dropzones</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <HomeDzGlobe users={homeDzUsers} />
          {homeDzUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              No public home DZs yet — set yours in Profile
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {homeDzUsers.length} jumper{homeDzUsers.length !== 1 ? "s" : ""}{" "}
              sharing their home DZ
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
