import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

interface LogRow {
  id: number;
  device_id: number | null;
  log_source: string | null;
  log_number: number | null;
  content: string | null;
  uploaded_at: string;
}

export default async function LogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) notFound();

  const supabase = await createServerClient();
  const { data } = (await supabase
    .from("system_logs")
    .select("id, device_id, log_source, log_number, content, uploaded_at")
    .eq("id", id)
    .single()) as { data: LogRow | null };

  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/logs"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← System Logs
          </Link>
          <h2 className="text-xl font-bold text-foreground mt-1">
            {data.log_source ?? "syslog"}
            {data.log_number != null ? ` #${data.log_number}` : ""}
          </h2>
          <p className="text-xs text-muted-foreground">
            {new Date(data.uploaded_at).toLocaleString()}
            {data.device_id ? ` · device ${data.device_id}` : ""}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all max-h-[60vh] overflow-auto bg-muted/30 rounded-md p-3">
            {data.content ?? "(empty)"}
          </pre>
        </CardContent>
      </Card>

      <Button variant="ghost" asChild>
        <Link href="/logs">Back to logs</Link>
      </Button>
    </div>
  );
}
