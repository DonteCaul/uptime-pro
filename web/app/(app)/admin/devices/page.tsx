import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin · Devices" };

interface DeviceRow {
  id: number;
  device_id: number;
  device_type: string | null;
  hardware_serial: string | null;
  firmware_version: string | null;
  last_seen_at: string | null;
  current_user_id: string | null;
}

export default async function AdminDevicesPage() {
  const supabase = await createServerClient();
  const { data } = (await supabase
    .from("devices")
    .select(
      "id, device_id, device_type, hardware_serial, firmware_version, last_seen_at, current_user_id",
    )
    .order("last_seen_at", { ascending: false, nullsFirst: false })) as {
    data: DeviceRow[] | null;
  };

  const devices = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-bold text-foreground">Devices ({devices.length})</h3>

      {devices.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No devices registered.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {devices.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {d.device_type ?? `Device #${d.device_id}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ID {d.device_id}
                    {d.firmware_version ? ` · fw ${d.firmware_version}` : ""}
                    {d.hardware_serial ? ` · ${d.hardware_serial}` : ""}
                    {d.current_user_id ? ` · user ${d.current_user_id.slice(0, 8)}` : " · unassigned"}
                  </p>
                </div>
                {d.last_seen_at && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(d.last_seen_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
