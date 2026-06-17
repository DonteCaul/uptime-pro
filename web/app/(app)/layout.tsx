import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";

/**
 * Protected app shell. Every page under (app) requires an authenticated user.
 * The middleware also guards these routes; this is a defense-in-depth check
 * that lets server components trust the session before rendering.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Nav userEmail={user.email ?? null} />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
