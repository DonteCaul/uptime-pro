import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Account deletion endpoint.
 *
 * Requires an authenticated session. Non-admin users can only delete their
 * own account. Admin users may specify a user_id to delete another account.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let userId: string;
  const body = await request.json();

  if (body.user_id && user.id !== body.user_id) {
    // Deleting another user — require admin role.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden — can only delete your own account" },
        { status: 403 },
      );
    }
    userId = body.user_id;
  } else {
    userId = user.id;
  }

  try {
    const admin = createAdminClient();

    // Delete the user's profile and all related data from public tables.
    // The profiles table has ON DELETE CASCADE for jump-dependent data.
    await admin.from("profiles").delete().eq("id", userId);

    // Delete the user's auth account via the admin Auth API.
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) {
      console.error(
        `Account deletion: failed to delete auth user ${userId}:`,
        authError,
      );
    }
  } catch (err) {
    console.error(`Account deletion error for user ${userId}:`, err);
  }

  return NextResponse.json({ ok: true });
}
