import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Plane, Clock, Gauge } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { alt, speed, type UnitSystem } from "@/lib/units";
import { fmtDuration } from "@/lib/format";
import { encodeJumpId } from "@/lib/slug";

export const dynamic = "force-dynamic";

interface Profile {
  id: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  home_dz: string | null;
  uspa_license: string | null;
  ratings: string | null;
  canopy_size: number | null;
  wing_load: string | null;
  rig_type: string | null;
  canopy_type: string | null;
  is_public: boolean;
  units: string | null;
}

interface Stats {
  total_jumps: number;
  total_freefall_s: number | null;
  highest_exit_m: number | null;
  fastest_freefall_ms: number | null;
  first_jump: string | null;
  last_jump: string | null;
}

interface RecentJump {
  id: number;
  filename: string;
  jumped_at: string | null;
  exit_altitude_m: number | null;
  freefall_duration_s: number | null;
  max_freefall_speed_ms: number | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: profile } = (await supabase
    .from("profiles")
    .select("full_name, is_public")
    .eq("id", id)
    .single()) as { data: Profile | null };
  return { title: profile?.is_public ? `${profile.full_name} · UpTime.Pro` : "UpTime.Pro" };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  // 1. Profile (must be public).
  const { data: profile } = (await supabase
    .from("profiles")
    .select(
      "id, full_name, bio, avatar_url, home_dz, uspa_license, ratings, canopy_size, wing_load, rig_type, canopy_type, is_public, units",
    )
    .eq("id", id)
    .single()) as { data: Profile | null };

  if (!profile || !profile.is_public) {
    notFound();
  }

  const units = (profile.units ?? "metric") as UnitSystem;

  // 2. Recent public jumps (RLS allows reading jumps where is_public=true AND
  //    the owner's profile is_public=true — see migration 0008).
  const { data: userJumps } = await supabase
    .from("jumps")
    .select("id, filename, jumped_at, exit_altitude_m, freefall_duration_s, max_freefall_speed_ms")
    .eq("user_id", id)
    .eq("is_public", true)
    .neq("is_plane_ride", true)
    .order("jumped_at", { ascending: false, nullsFirst: false })
    .range(0, 9);

  const recentJumps = (userJumps ?? []) as RecentJump[];

  // Compute stats from a count + aggregates (public jumps only).
  const { count } = await supabase
    .from("jumps")
    .select("id", { count: "exact", head: true })
    .eq("user_id", id)
    .eq("is_public", true)
    .neq("is_plane_ride", true);

  const totalFreefall = recentJumps.reduce(
    (s, j) => s + (Number(j.freefall_duration_s) || 0),
    0,
  );
  const highestExit = recentJumps.reduce(
    (m, j) => Math.max(m, Number(j.exit_altitude_m) || 0),
    0,
  );
  const fastest = recentJumps.reduce(
    (m, j) => Math.max(m, Number(j.max_freefall_speed_ms) || 0),
    0,
  );

  const stats: Stats = {
    total_jumps: count ?? 0,
    total_freefall_s: totalFreefall,
    highest_exit_m: highestExit,
    fastest_freefall_ms: fastest,
    first_jump: null,
    last_jump: recentJumps[0]?.jumped_at ?? null,
  };

  const initials = (profile.full_name || "U")[0]?.toUpperCase() ?? "U";

  return (
    <div className="min-h-screen bg-background">
      {/* Back link + container */}
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/social"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          ← Back to Social
        </Link>

        {/* Header card */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              <div className="shrink-0">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name ?? "avatar"}
                    className="w-24 h-24 rounded-full object-cover border-2 border-border"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-primary text-3xl font-bold">
                    {initials}
                  </div>
                )}
              </div>
              <div className="flex-1 text-center sm:text-left min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <h1 className="text-2xl font-bold text-foreground">
                    {profile.full_name ?? "Anonymous"}
                  </h1>
                  {profile.uspa_license && (
                    <Badge variant="secondary">{profile.uspa_license}</Badge>
                  )}
                </div>
                {profile.home_dz && (
                  <p className="flex items-center justify-center sm:justify-start gap-1 text-sm text-muted-foreground mt-1">
                    <MapPin size={13} /> {profile.home_dz}
                  </p>
                )}
                {profile.bio && (
                  <p className="text-sm text-muted-foreground mt-3 max-w-prose">
                    {profile.bio}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatTile
            icon={<Plane size={16} />}
            label="Jumps"
            value={String(stats.total_jumps)}
          />
          <StatTile
            icon={<Clock size={16} />}
            label="Freefall"
            value={fmtDuration(stats.total_freefall_s) ?? "0s"}
          />
          <StatTile
            icon={<Gauge size={16} />}
            label="Highest"
            value={alt(stats.highest_exit_m, units)}
          />
          <StatTile
            icon={<Gauge size={16} />}
            label="Fastest"
            value={speed(stats.fastest_freefall_ms, units)}
          />
        </div>

        {/* Gear */}
        {(profile.rig_type || profile.canopy_type || profile.ratings) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Gear &amp; Ratings</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                {profile.rig_type && (
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase tracking-wider">
                      Rig
                    </dt>
                    <dd className="text-foreground">{profile.rig_type}</dd>
                  </div>
                )}
                {profile.canopy_type && (
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase tracking-wider">
                      Canopy
                    </dt>
                    <dd className="text-foreground">
                      {profile.canopy_type}
                      {profile.canopy_size && ` · ${profile.canopy_size} sq ft`}
                    </dd>
                  </div>
                )}
                {profile.wing_load && (
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase tracking-wider">
                      Wing Load
                    </dt>
                    <dd className="text-foreground">{profile.wing_load}</dd>
                  </div>
                )}
                {profile.ratings && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-xs text-muted-foreground uppercase tracking-wider">
                      Ratings
                    </dt>
                    <dd className="text-foreground">{profile.ratings}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Recent jumps */}
        {recentJumps.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Jumps</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recentJumps.map((j) => (
                <Link
                  key={j.id}
                  href={`/jumps/${encodeJumpId(j.id)}`}
                  className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 hover:bg-accent/50 transition-colors"
                >
                  <div>
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
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8">
          Profile last active{" "}
          {stats.last_jump
            ? new Date(stats.last_jump).toLocaleDateString()
            : "—"}
        </p>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
          {icon}
          <span className="text-[10px] font-bold uppercase tracking-wider">
            {label}
          </span>
        </div>
        <p className="text-xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
