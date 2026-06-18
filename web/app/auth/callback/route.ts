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
  const next = searchParams.get("next") ?? "/jumps";

  if (code) {
    // Build the redirect response first so we can set cookies on it.
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
            // Write session cookies onto the response, not the request.
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
