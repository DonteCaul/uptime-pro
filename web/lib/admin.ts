import { createServerClient } from "@/lib/supabase/server";

/**
 * Returns true if the signed-in user has role = 'admin' on their profile.
 * Used as a guard in admin pages + server actions.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return data?.role === "admin";
}

/**
 * Throws if the signed-in user is not an admin. Use at the top of admin
 * pages and server actions.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error("Admin access required");
  }
}
