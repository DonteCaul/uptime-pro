import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";

/**
 * Proxy (Next.js 16 successor to middleware). Runs on every request at the
 * network boundary. Refreshes the Supabase auth session and guards protected
 * routes. Mirrors the official @supabase/ssr Next.js pattern.
 *
 * - `(app)/*` routes require a signed-in user; redirects to /login otherwise.
 * - `/login` and `/register` redirect to /jumps if already signed in.
 * - The Dekunu device layer (`/v1/*`) and `/api/*` are not auth-gated here —
 *   they carry their own auth (device JWTs, service-role checks).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run any code between createServerClient and getUser.
  // A simple mistake here can make it very hard to debug session issues.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // Root path is the dashboard; everything else under the (app) group is
  // also protected. The (auth) pages and /api/* + /v1/* manage their own access.
  const isProtected =
    pathname === "/dashboard" ||
    pathname.startsWith("/jumps") ||
    pathname.startsWith("/upload") ||
    pathname.startsWith("/social") ||
    pathname.startsWith("/logs") ||
    pathname.startsWith("/devices") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings");
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/jumps";
    url.searchParams.delete("redirect");
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image, favicon
     * - api/v1 (device + internal routes manage their own auth)
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map)$).*)",
  ],
};
