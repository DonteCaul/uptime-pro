"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Toggle a user's role between 'user' and 'admin'. Admin-only.
 */
export async function setUserRole(userId: string, role: "user" | "admin") {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Toggle a user's public visibility. Admin-only.
 */
export async function setUserPublic(userId: string, isPublic: boolean) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_public: isPublic })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Delete a user's account + all their data. Admin-only. Cascades to jumps,
 * telemetry, devices, and logs via FK ON DELETE CASCADE.
 */
export async function deleteUser(userId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  // Delete auth.users → cascades to profiles, jumps (→ jump_data_points),
  // devices, system_logs.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Flush a cache table (places_cache, geocode_cache, weather_cache). Admin-only.
 */
export async function flushCache(
  table: "places_cache" | "geocode_cache" | "weather_cache",
) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from(table).delete().neq("id", 0);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return { ok: true };
}
