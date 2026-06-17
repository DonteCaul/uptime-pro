import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { AdminUserRow } from "./AdminUserRow";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin · Users" };

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  uptime_user_id: number | null;
  role: string | null;
  is_public: boolean;
  created_at: string;
}

export default async function AdminUsersPage() {
  const supabase = await createServerClient();
  const { data } = (await supabase
    .from("profiles")
    .select("id, email, full_name, uptime_user_id, role, is_public, created_at")
    .order("created_at", { ascending: false })) as { data: Profile[] | null };

  const users = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">Users</h3>
        <span className="text-sm text-muted-foreground">{users.length} total</span>
      </div>

      {users.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No users yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {users.map((u) => (
              <AdminUserRow key={u.id} user={u} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
