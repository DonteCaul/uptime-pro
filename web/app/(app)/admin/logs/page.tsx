import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, X } from "lucide-react";
import { AdminLogsClient } from "./AdminLogsClient";

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

interface DeviceOption {
  id: number;
  device_id: number;
  device_type: string | null;
}

interface UserOption {
  id: string;
  full_name: string | null;
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    offset?: string;
    device?: string;
    user?: string;
  }>;
}) {
  const params = await searchParams;
  const offset = Math.max(0, parseInt(params.offset ?? "0") || 0);
  const filterDevice = params.device ? parseInt(params.device, 10) : null;
  const filterUser = params.user || null;

  const supabase = await createServerClient();

  // Fetch unique devices that have logs (for filter dropdown).
  const { data: deviceOpts } = (await supabase
    .from("system_logs")
    .select("device_id")
    .not("device_id", "is", null)
    .order("device_id")) as { data: { device_id: number }[] | null };

  // Fetch unique users that have logs (for filter dropdown).
  const { data: userOpts } = (await supabase
    .from("system_logs")
    .select("user_id")
    .not("user_id", "is", null)
    .order("user_id")) as { data: { user_id: string }[] | null };

  // Deduplicate and get display names.
  const uniqueDeviceIds = [...new Set((deviceOpts ?? []).map((d) => d.device_id))];
  const uniqueUserIds = [...new Set((userOpts ?? []).map((u) => u.user_id))];

  // Fetch device display info.
  const { data: devices } = (await supabase
    .from("devices")
    .select("id, device_id, device_type")
    .in("id", uniqueDeviceIds)) as { data: DeviceOption[] | null };

  // Fetch user display names.
  const { data: users } = (await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", uniqueUserIds)) as { data: UserOption[] | null };

  const deviceMap = new Map(
    (devices ?? []).map((d) => [d.device_id, d]),
  );
  const userMap = new Map(
    (users ?? []).map((u) => [u.id, u]),
  );

  // Build query with filters.
  let query = supabase
    .from("system_logs")
    .select("id, device_id, log_source, log_number, user_id, uploaded_at")
    .order("uploaded_at", { ascending: false });

  if (filterDevice != null) {
    query = query.eq("device_id", filterDevice);
  }
  if (filterUser) {
    query = query.eq("user_id", filterUser);
  }

  // Count with same filters.
  const countQuery = supabase
    .from("system_logs")
    .select("id", { count: "exact", head: true });
  if (filterDevice != null) {
    countQuery.eq("device_id", filterDevice);
  }
  if (filterUser) {
    countQuery.eq("user_id", filterUser);
  }
  const { count } = await countQuery;

  const { data } = (await query.range(
    offset,
    offset + PAGE_SIZE - 1,
  )) as { data: LogRow[] | null };

  const logs = data ?? [];
  const total = count ?? 0;
  const hasNext = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  // Build pagination URL preserving filters.
  function pageUrl(newOffset: number) {
    const parts = [`offset=${newOffset}`];
    if (filterDevice != null) parts.push(`device=${filterDevice}`);
    if (filterUser) parts.push(`user=${filterUser}`);
    return `/admin/logs?${parts.join("&")}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">System Logs</h3>
        <span className="text-sm text-muted-foreground">
          {total} matching
          {total > PAGE_SIZE &&
            ` · ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)}`}
        </span>
      </div>

      {/* Filter bar */}
      <AdminLogsClient
        devices={uniqueDeviceIds.map((did) => ({
          value: did,
          label:
            deviceMap.get(did)?.device_type
              ? `${deviceMap.get(did)!.device_type} (#${did})`
              : `Device #${did}`,
        }))}
        users={uniqueUserIds.map((uid) => ({
          value: uid,
          label:
            userMap.get(uid)?.full_name || uid.slice(0, 8),
        }))}
        currentDevice={filterDevice}
        currentUser={filterUser}
      />

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {filterDevice || filterUser
              ? "No logs match the selected filters."
              : "No system logs."}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              {logs.map((log) => {
                const dev = log.device_id ? deviceMap.get(log.device_id) : null;
                const usr = log.user_id ? userMap.get(log.user_id) : null;

                return (
                  <Link
                    key={log.id}
                    href={`/admin/logs/${log.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {log.log_source ?? "syslog"}
                        {log.log_number != null ? ` #${log.log_number}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(log.uploaded_at).toLocaleString()}
                        {dev && (
                          <span>
                            {" "}
                            · {dev.device_type ?? `Device`} #{log.device_id}
                          </span>
                        )}
                        {usr && (
                          <span> · {usr.full_name || log.user_id!.slice(0, 8)}</span>
                        )}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </Link>
                );
              })}
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
                <Link href={pageUrl(Math.max(0, offset - PAGE_SIZE))}>
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
                <Link href={pageUrl(offset + PAGE_SIZE)}>Next →</Link>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
