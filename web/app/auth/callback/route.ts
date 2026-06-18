import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";

/**
 * Supabase auth callback — handles email-confirmation links and OAuth redirects.
 * Exchanges the `code` param for a session, then redirects to the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Read the post-login redirect from the cookie (set by the login form)
  // rather than a query param — Supabase strips custom query params from
  // the redirectTo URL during the OAuth flow.
  const redirectCookie = request.cookies.get("auth-redirect")?.value;
  const next = redirectCookie ? decodeURIComponent(redirectCookie) : (searchParams.get("next") ?? "/jumps");

  if (code) {
    // Build the redirect response first so cookies can be written onto it.
    const redirectResponse = NextResponse.redirect(`${origin}${next}`);

    // Clear the redirect cookie so it's not reused on future logins.
    redirectResponse.cookies.delete("auth-redirect");

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            // Write onto the response, not the request.
            cookiesToSet.forEach(({ name, value, options }) =>
              redirectResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectResponse;
    }
  }

  // Redirect back to login with an error flag if exchange failed.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
