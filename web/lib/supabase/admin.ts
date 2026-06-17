import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

/**
 * Service-role Supabase client — bypasses Row-Level Security.
 *
 * SERVER-ONLY. Never import this from a Client Component or expose the key to
 * the browser. Used for privileged operations: bulk CSV insert, cache writes,
 * migrations, and admin tasks where RLS would block legitimate server work.
 *
 * Always scope queries to a known user_id explicitly when using this client,
 * since RLS will not enforce tenancy for you.
 */
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Server-only privileged operations require it.",
    );
  }

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        // The admin client is not used for user auth flows; skip auto-persist.
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
