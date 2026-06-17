"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/db/types";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

/**
 * Revalidate every route that reads the user's units/theme preference.
 * Called after any preference change so all pages reflect the new setting
 * immediately (server components cache the preference at render time).
 */
function revalidateAllPrefRoutes() {
  revalidatePath("/dashboard");
  revalidatePath("/jumps");
  revalidatePath("/jumps", "page");
  revalidatePath("/jumps/[id]", "page");
  revalidatePath("/devices");
  revalidatePath("/devices/[deviceId]", "page");
  revalidatePath("/social");
  revalidatePath("/profile");
  revalidatePath("/settings");
  revalidatePath("/u/[id]", "page");
}

/**
 * Update the signed-in user's profile. Only the provided fields are written
 * (undefined fields are skipped), matching the original PATCH /users/me shape.
 *
 * RLS allows users to update only their own row, so this is safe via the
 * session-bound server client.
 */
export async function updateProfile(values: ProfileUpdate) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("profiles")
    .update(values)
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  // Refresh cached reads across all pref-aware routes.
  revalidateAllPrefRoutes();

  return { ok: true };
}

/**
 * Update only the user's UI preferences (theme + units). Used by the Settings
 * page toggles.
 */
export async function updatePreferences(values: {
  theme?: "light" | "dark";
  units?: "metric" | "imperial";
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const update: ProfileUpdate = {};
  if (values.theme) update.theme = values.theme;
  if (values.units) update.units = values.units;

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidateAllPrefRoutes();

  return { ok: true };
}
