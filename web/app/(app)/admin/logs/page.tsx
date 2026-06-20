import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin · System Logs" };

const PAGE_SIZE = 200;

interface LogRow {
  id: number;
  device_id: number | null;
  log_source: string | null;
  log_number: number | null;
  user_id: string | null;
  uploaded_at: string;
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const params = await searchParams;
  const offset = Math.max(0, parseInt(params.offset ?? "0") || 0);

  const supabase = await createServerClient();

  const { count } = await supabase
    .from("system_logs")
    .select("id", { count: "exact", head: true });

  const { data } = (await supabase
    .from("system_logs")
    .select("id, device_id, log_source, log_number, user_id, uploaded_at")
    .order("uploaded_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)) as { data: LogRow[] | null };

  const logs = data ?? [];
  const total = count ?? 0;
  const hasNext = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">System Logs</h3>
        <span className="text-sm text-muted-foreground">
          {total}
          {total > PAGE_SIZE &&
            ` · ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)}`}
        </span>
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No system logs.
          </CardContent>
        </Card>
      ) : (
        <>
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

          {total > PAGE_SIZE && (
            <div className="flex justify-between items-center pt-2">
              <Button
                variant="secondary"
                size="sm"
                asChild={hasPrev}
                disabled={!hasPrev}
              >
                <Link
                  href={`/admin/logs?offset=${Math.max(0, offset - PAGE_SIZE)}`}
                  aria-disabled={!hasPrev}
                >
                  ← Prev
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <Button
                variant="secondary"
                size="sm"
                asChild={hasNext}
                disabled={!hasNext}
              >
                <Link
                  href={`/admin/logs?offset=${offset + PAGE_SIZE}`}
                  aria-disabled={!hasNext}
                >
                  Next →
                </Link>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
