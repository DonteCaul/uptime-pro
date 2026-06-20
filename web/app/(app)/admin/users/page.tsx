import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminUserRow } from "./AdminUserRow";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin · Users" };

const PAGE_SIZE = 50;

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  uptime_user_id: number | null;
  role: string | null;
  is_public: boolean;
  created_at: string;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const params = await searchParams;
  const offset = Math.max(0, parseInt(params.offset ?? "0") || 0);

  const supabase = await createServerClient();

  // Total count for pagination info.
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });

  const { data } = (await supabase
    .from("profiles")
    .select("id, email, full_name, uptime_user_id, role, is_public, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)) as { data: Profile[] | null };

  const users = data ?? [];
  const total = count ?? 0;
  const hasNext = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">Users</h3>
        <span className="text-sm text-muted-foreground">
          {total} total
          {total > PAGE_SIZE &&
            ` · ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)}`}
        </span>
      </div>

      {users.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No users yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              {users.map((u) => (
                <AdminUserRow key={u.id} user={u} />
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
                  href={`/admin/users?offset=${Math.max(0, offset - PAGE_SIZE)}`}
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
                  href={`/admin/users?offset=${offset + PAGE_SIZE}`}
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
