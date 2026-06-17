import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "System Logs · UpTime.Pro" };

interface LogRow {
  id: number;
  device_id: number | null;
  log_source: string | null;
  log_number: number | null;
  uploaded_at: string;
}

export default async function LogsPage() {
  const supabase = await createServerClient();
  const { data } = (await supabase
    .from("system_logs")
    .select("id, device_id, log_source, log_number, uploaded_at")
    .order("uploaded_at", { ascending: false })
    .range(0, 99)) as { data: LogRow[] | null };

  const logs = data ?? [];

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">System Logs</h2>
        {logs.length > 0 && (
          <span className="text-sm text-muted-foreground">{logs.length}</span>
        )}
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No system logs yet.</p>
            <Link
              href="/upload"
              className="text-xs text-primary hover:underline mt-1 inline-block"
            >
              Upload logs →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {logs.map((log) => (
              <Link
                key={log.id}
                href={`/logs/${log.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border last:border-0 first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {log.log_source ?? "syslog"}
                    {log.log_number != null ? ` #${log.log_number}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(log.uploaded_at).toLocaleString()}
                    {log.device_id ? ` · device ${log.device_id}` : ""}
                  </p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
