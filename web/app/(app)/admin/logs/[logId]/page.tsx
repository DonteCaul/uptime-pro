import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin · Log Detail" };

interface LogRow {
  id: number;
  device_id: number | null;
  user_id: string | null;
  log_source: string | null;
  log_number: number | null;
  content: string | null;
  uploaded_at: string;
}

export default async function AdminLogDetailPage({
  params,
}: {
  params: Promise<{ logId: string }>;
}) {
  const { logId } = await params;
  const logIdNum = parseInt(logId, 10);
  if (Number.isNaN(logIdNum)) notFound();

  const supabase = await createServerClient();

  const { data } = (await supabase
    .from("system_logs")
    .select(
      "id, device_id, user_id, log_source, log_number, content, uploaded_at",
    )
    .eq("id", logIdNum)
    .single()) as { data: LogRow | null };

  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/admin/logs"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Admin Logs
        </Link>
        <h3 className="text-lg font-bold text-foreground mt-1">
          {data.log_source ?? "syslog"}
          {data.log_number != null ? ` #${data.log_number}` : ""}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date(data.uploaded_at).toLocaleString()}
          {data.user_id ? ` · user ${data.user_id.slice(0, 8)}` : ""}
          {data.device_id ? ` · device ${data.device_id}` : ""}
        </p>
      </div>

      <Card>
        <CardContent className="p-3">
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all max-h-[60vh] overflow-auto bg-muted/30 rounded-md p-3">
            {data.content ?? "(empty)"}
          </pre>
        </CardContent>
      </Card>

      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/logs">Back to admin logs</Link>
      </Button>
    </div>
  );
}
