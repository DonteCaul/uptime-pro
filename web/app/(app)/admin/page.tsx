import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlushCacheButton } from "./FlushCacheButton";
import { DekunuCompatToggle } from "./DekunuCompatToggle";
import { getDekunuCompat } from "@/lib/actions/admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin · UpTime.Pro" };

export default async function AdminOverviewPage() {
  const supabase = await createServerClient();

  // Fetch Dekunu compat setting.
  const dekunuCompat = await getDekunuCompat();

  // Counts — admin RLS policies allow reading everything.
  const [usersRes, jumpsRes, devicesRes, logsRes] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("jumps").select("id", { count: "exact", head: true }),
    supabase.from("devices").select("id", { count: "exact", head: true }),
    supabase.from("system_logs").select("id", { count: "exact", head: true }),
  ]);

  const [placesRes, geocodeRes, weatherRes] = await Promise.all([
    supabase.from("places_cache").select("id", { count: "exact", head: true }),
    supabase.from("geocode_cache").select("id", { count: "exact", head: true }),
    supabase.from("weather_cache").select("id", { count: "exact", head: true }),
  ]);

  const counts = [
    { label: "Users", value: usersRes.count ?? 0, href: "/admin/users" },
    { label: "Jumps", value: jumpsRes.count ?? 0, href: null },
    { label: "Devices", value: devicesRes.count ?? 0, href: "/admin/devices" },
    { label: "System Logs", value: logsRes.count ?? 0, href: "/admin/logs" },
  ];

  const caches = [
    { table: "places_cache" as const, label: "Places (Google)", count: placesRes.count ?? 0 },
    { table: "geocode_cache" as const, label: "Geocode (Mapbox)", count: geocodeRes.count ?? 0 },
    { table: "weather_cache" as const, label: "Weather (Open-Meteo)", count: weatherRes.count ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Count tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {counts.map(({ label, value, href }) => {
          const content = (
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                {label}
              </p>
              <p className="text-2xl font-bold text-foreground">{value}</p>
            </CardContent>
          );
          return href ? (
            <Link key={label} href={href}>
              <Card className="hover:border-primary/40 transition-colors">
                {content}
              </Card>
            </Link>
          ) : (
            <Card key={label}>{content}</Card>
          );
        })}
      </div>

      {/* Dekunu device compat */}
      <Card>
        <CardHeader>
          <CardTitle>Device Integrations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <DekunuCompatToggle initial={dekunuCompat} />
        </CardContent>
      </Card>

      {/* Cache management */}
      <Card>
        <CardHeader>
          <CardTitle>External API Caches</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {caches.map(({ table, label, count }) => (
            <div
              key={table}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {count} cached {count === 1 ? "entry" : "entries"}
                </p>
              </div>
              <FlushCacheButton table={table} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
