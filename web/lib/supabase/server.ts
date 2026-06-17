import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/db/types";

/**
 * Supabase client bound to the incoming request's cookies.
 *
 * Use this in Server Components, Route Handlers, and Server Actions. Reads are
 * automatically scoped to the signed-in user via Row-Level Security — no manual
 * `user_id` filtering needed.
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method is called from a Server Component where
            // cookies cannot be mutated. This is safe to ignore — the session
            // refresh is handled by middleware.ts instead.
          }
        },
      },
    },
  );
}
