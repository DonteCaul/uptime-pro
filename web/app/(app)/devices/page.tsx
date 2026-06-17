import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Devices · UpTime.Pro" };

interface DeviceRow {
  id: number;
  device_id: number;
  device_type: string | null;
  hardware_serial: string | null;
  firmware_version: string | null;
  last_seen_at: string | null;
}

/**
 * Devices list for the signed-in user. Uses the admin client for the
 * jump-count join (RLS on jumps scopes by ownership, but the aggregate join
 * across devices is simpler with the service role).
 */
export default async function DevicesPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 1. Devices owned by this user.
  const { data: deviceRows } = (await supabase
    .from("devices")
    .select(
      "id, device_id, device_type, hardware_serial, firmware_version, last_seen_at",
    )
    .eq("current_user_id", user.id)
    .order("last_seen_at", { ascending: false, nullsFirst: false })) as {
    data: DeviceRow[] | null;
  };
  const devices = deviceRows ?? [];

  // 2. Jump counts per device (admin client for the join).
  const admin = createAdminClient();
  const { data: counts } = await admin
    .from("jumps")
    .select("device_id")
    .eq("user_id", user.id);

  const countMap = new Map<number, number>();
  for (const row of counts ?? []) {
    const did = (row as { device_id: number | null }).device_id;
    if (did != null) countMap.set(did, (countMap.get(did) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Devices</h2>
        {devices.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {devices.length} paired
          </span>
        )}
      </div>

      {devices.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No paired devices yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Devices appear here automatically when they sync via the Dekunu
              compat layer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {devices.map((d) => {
              const jumpCount = countMap.get(d.id) ?? 0;
              return (
                <Link
                  key={d.id}
                  href={`/devices/${d.device_id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border last:border-0 first:rounded-t-lg last:rounded-b-lg"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {d.device_type ?? `Device #${d.device_id}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      ID {d.device_id}
                      {d.firmware_version ? ` · fw ${d.firmware_version}` : ""}
                      {d.hardware_serial
                        ? ` · ${d.hardware_serial}`
                        : ""}
                    </p>
                    {d.last_seen_at && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Last seen{" "}
                        {new Date(d.last_seen_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {jumpCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {jumpCount} jump{jumpCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
