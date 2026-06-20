import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata = { title: "Log Detail · UpTime.Pro" };

interface LogRow {
  id: number;
  device_id: number | null;
  log_source: string | null;
  log_number: number | null;
  content: string | null;
  uploaded_at: string;
}

export default async function DeviceLogDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string; logId: string }>;
}) {
  const { deviceId, logId } = await params;
  const logIdNum = parseInt(logId, 10);
  const deviceIdNum = parseInt(deviceId, 10);
  if (Number.isNaN(logIdNum) || Number.isNaN(deviceIdNum)) notFound();

  const supabase = await createServerClient();

  // Resolve the Dekunu device_id to the internal DB id.
  const { data: dev } = (await supabase
    .from("devices")
    .select("id")
    .eq("device_id", deviceIdNum)
    .maybeSingle()) as { data: { id: number } | null };

  if (!dev) notFound();

  const { data } = (await supabase
    .from("system_logs")
    .select("id, device_id, log_source, log_number, content, uploaded_at")
    .eq("id", logIdNum)
    .eq("device_id", dev.id)
    .single()) as { data: LogRow | null };

  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div>
        <Link
          href={`/devices/${deviceId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Device #{deviceId}
        </Link>
        <h2 className="text-xl font-bold text-foreground mt-1">
          {data.log_source ?? "syslog"}
          {data.log_number != null ? ` #${data.log_number}` : ""}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date(data.uploaded_at).toLocaleString()}
        </p>
      </div>

      <Card>
        <CardContent className="p-3">
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all max-h-[60vh] overflow-auto bg-muted/30 rounded-md p-3">
            {data.content ?? "(empty)"}
          </pre>
        </CardContent>
      </Card>

      <Button variant="ghost" asChild>
        <Link href={`/devices/${deviceId}`}>Back to device</Link>
      </Button>
    </div>
  );
}
