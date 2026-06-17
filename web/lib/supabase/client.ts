import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";

/**
 * Supabase client for Client Components.
 *
 * Uses the anon key (safe to expose) and reads/writes auth cookies managed by
 * @supabase/ssr. Avoid using this for privileged reads — those should go
 * through the server client so RLS applies on the server.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
