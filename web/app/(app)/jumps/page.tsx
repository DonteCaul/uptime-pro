import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

interface JumpsListItem {
  id: number;
  filename: string;
  jumped_at: string | null;
  exit_altitude_m: number | null;
  max_freefall_speed_ms: number | null;
}

/**
 * Jumps list — Phase 1 will port the All / By-Dropzone / Map tabs from
 * the Vite app. For now this proves the RLS-bound server read works.
 */
export default async function JumpsPage() {
  const supabase = await createServerClient();
  // TODO: replace this cast with proper generated Supabase types once
  // migration 0001 is applied (see lib/db/types.ts).
  const { data: jumps, error } = (await supabase
    .from("jumps")
    .select("id, filename, jumped_at, exit_altitude_m, max_freefall_speed_ms")
    .order("jumped_at", { ascending: false, nullsFirst: false })
    .range(0, 19)) as {
    data: JumpsListItem[];
    error: { message: string } | null;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">Jumps</h1>

      <Card>
        <CardHeader>
          <CardTitle>Recent ({jumps?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error.message}</p>
          ) : !jumps || jumps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No jumps yet — upload a CSV to get started.
            </p>
          ) : (
            <ul className="space-y-2">
              {jumps.map((j) => (
                <li key={j.id} className="text-sm">
                  <span className="font-medium">{j.filename}</span>
                  <span className="text-muted-foreground ml-2">
                    {j.jumped_at
                      ? new Date(j.jumped_at).toLocaleDateString()
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
