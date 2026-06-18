import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";

/**
 * Supabase auth callback — handles email-confirmation links and OAuth redirects.
 * Exchanges the `code` param for a session, then redirects to the app.
 *
 * Uses NextResponse.redirect() (not redirect() from next/navigation) so the
 * returned Response object carries the auth cookies set by exchangeCodeForSession.
 *
 * Redirect priority:
 * 1. Cookie `auth-redirect` (set by login form before OAuth redirect)
 * 2. Query param `next` (from email links; may be stripped by Supabase OAuth)
 * 3. Default: `/dashboard`
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Determine where to send the user after login.
  const redirectCookie = request.cookies.get("auth-redirect")?.value;
  const next = redirectCookie
    ? decodeURIComponent(redirectCookie)
    : (searchParams.get("next") ?? "/dashboard");

  console.log("[auth/callback] code:", !!code, "next:", next, "origin:", origin);

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  try {
    // Build the redirect response first so we can write cookies onto it.
    const redirectResponse = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              redirectResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[auth/callback] exchangeCodeForSession error:", error.message);
      const errorUrl = new URL("/login", origin);
      errorUrl.searchParams.set("error", "auth_callback_failed");
      errorUrl.searchParams.set("details", error.message);
      return NextResponse.redirect(errorUrl);
    }

    console.log("[auth/callback] session established for:", data.session?.user?.email ?? "unknown");

    // Clear the redirect cookie so it's not reused on future logins.
    redirectResponse.cookies.delete("auth-redirect");

    return redirectResponse;
  } catch (err) {
    // If anything throws, redirect to login with a generic error.
    console.error("[auth/callback] unexpected error:", err);
    return NextResponse.redirect(`${origin}/login?error=callback_exception`);
  }
}
