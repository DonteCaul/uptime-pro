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
 *
 * Reads `SUPABASE_SECRET_KEY` (the new `sb_secret_…` format) and falls back to
 * the legacy `SUPABASE_SERVICE_ROLE_KEY` so projects on either key format work.
 */
export function getSupabaseSecretKey(): string {
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. Server-only privileged operations require it.",
    );
  }
  return secretKey;
}

export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseSecretKey(),
    {
      auth: {
        // The admin client is not used for user auth flows; skip auto-persist.
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
