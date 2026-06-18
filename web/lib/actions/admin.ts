"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateCompatCache } from "@/lib/dekunu/jwt";

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

/**
 * Toggle Dekunu device compat on/off. Admin-only.
 * Writes to app_settings.dekunu_compat and invalidates the in-memory cache.
 */
export async function setDekunuCompat(enabled: boolean) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .upsert(
      { key: "dekunu_compat", value: enabled ? "true" : "false", updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(error.message);
  await invalidateCompatCache();
  revalidatePath("/admin");
  return { ok: true, enabled };
}

/**
 * Read the current Dekunu compat setting from app_settings. Admin-only.
 */
export async function getDekunuCompat(): Promise<boolean> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "dekunu_compat")
    .maybeSingle();
  return data?.value === "true";
}
