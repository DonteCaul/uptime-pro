import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { type UnitSystem } from "@/lib/units";
import { DeviceDetailClient } from "./DeviceDetailClient";

export const dynamic = "force-dynamic";

interface DeviceRow {
  id: number;
  device_id: number;
  device_type: string | null;
  hardware_serial: string | null;
  firmware_version: string | null;
  last_seen_at: string | null;
}

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

export default async function DeviceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ deviceId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { deviceId: deviceIdStr } = await params;
  const deviceId = parseInt(deviceIdStr, 10);
  if (Number.isNaN(deviceId)) notFound();

  const params_ = await searchParams;
  const tab = params_.tab === "logs" ? "logs" : "jumps";

  const supabase = await createServerClient();

  // Resolve unit preference.
  const { data: profile } = await supabase
    .from("profiles")
    .select("units")
    .single();
  const units = (profile?.units ?? "metric") as UnitSystem;

  // Device metadata.
  const { data: device } = (await supabase
    .from("devices")
    .select(
      "id, device_id, device_type, hardware_serial, firmware_version, last_seen_at",
    )
    .eq("device_id", deviceId)
    .single()) as { data: DeviceRow | null };

  if (!device) notFound();

  // Jumps from this device.
  const { data: jumpRows } = (await supabase
    .from("jumps")
    .select(
      "id, filename, jumped_at, exit_altitude_m, freefall_duration_s, max_freefall_speed_ms",
    )
    .eq("device_id", device.id)
    .order("jumped_at", { ascending: false, nullsFirst: false })) as {
    data: JumpRow[] | null;
  };
  const jumps = jumpRows ?? [];

  // System logs for this device.
  const { data: logRows } = (await supabase
    .from("system_logs")
    .select("id, log_source, log_number, uploaded_at")
    .eq("device_id", device.id)
    .order("uploaded_at", { ascending: false })) as {
    data: LogRow[] | null;
  };
  const logs = logRows ?? [];

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div>
        <Link
          href="/devices"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Devices
        </Link>
        <h2 className="text-xl font-bold text-foreground mt-1">
          {device.device_type ?? `Device #${device.device_id}`}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          ID {device.device_id}
          {device.firmware_version
            ? ` · firmware ${device.firmware_version}`
            : ""}
          {device.hardware_serial
            ? ` · serial ${device.hardware_serial}`
            : ""}
          {device.last_seen_at
            ? ` · last seen ${new Date(device.last_seen_at).toLocaleDateString()}`
            : ""}
        </p>
      </div>

      <DeviceDetailClient
        tab={tab}
        jumps={jumps}
        logs={logs}
        serverUnits={units}
        deviceInternalId={device.id}
      />

      <Button variant="ghost" asChild>
        <Link href="/devices">Back to devices</Link>
      </Button>
    </div>
  );
}
