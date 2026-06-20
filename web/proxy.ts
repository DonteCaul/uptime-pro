import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";

/**
 * Proxy (Next.js 16 successor to middleware). Runs on every request at the
 * network boundary. Refreshes the Supabase auth session, guards protected
 * routes, and sets security headers.
 *
 * - `(app)/*` routes require a signed-in user; redirects to /login otherwise.
 * - `/login` and `/register` redirect to /dashboard if already signed in.
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

  // ── Security Headers ──────────────────────────────────────────────────────
  const isDev = process.env.NODE_ENV === "development";
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://api.mapbox.com https://unpkg.com",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://api.mapbox.com https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com https://fonts.mapbox.com",
    "img-src 'self' blob: data: https://*.supabase.co https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://*.tiles.mapbox.com https://api.mapbox.com",
    "connect-src 'self' https://*.supabase.co https://*.mapbox.com https://api.mapbox.com https://events.mapbox.com https://accounts.mapbox.com https://fonts.mapbox.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    isDev ? "" : "upgrade-insecure-requests",
  ].filter(Boolean).join("; ");

  response.headers.set("Content-Security-Policy", cspDirectives);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  response.headers.set("X-DNS-Prefetch-Control", "on");
  response.headers.set("X-Download-Options", "noopen");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  if (!isDev) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

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
    url.pathname = "/dashboard";
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
