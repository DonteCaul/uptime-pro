import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin · System Logs" };

interface LogRow {
  id: number;
  device_id: number | null;
  log_source: string | null;
  log_number: number | null;
  user_id: string | null;
  uploaded_at: string;
}

export default async function AdminLogsPage() {
  const supabase = await createServerClient();
  const { data } = (await supabase
    .from("system_logs")
    .select("id, device_id, log_source, log_number, user_id, uploaded_at")
    .order("uploaded_at", { ascending: false })
    .range(0, 199)) as { data: LogRow[] | null };

  const logs = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-bold text-foreground">
        System Logs ({logs.length})
      </h3>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No system logs.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {logs.map((log) => (
              <Link
                key={log.id}
                href={`/logs/${log.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {log.log_source ?? "syslog"}
                    {log.log_number != null ? ` #${log.log_number}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(log.uploaded_at).toLocaleString()}
                    {log.user_id ? ` · user ${log.user_id.slice(0, 8)}` : ""}
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
