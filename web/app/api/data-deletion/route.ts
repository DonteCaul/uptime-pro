import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data Deletion Request Callback — required by Facebook Login.
 *
 * Facebook expects a POST endpoint they can call to request deletion of a
 * user's data. The signed request contains a `user_id` field that maps to
 * the user's Supabase auth UID.
 *
 * See: https://developers.facebook.com/docs/app-events/reference/app-events-api#data-deletion-request-callback
 */
const CONFIRMATION_CODE = `deletion_${Date.now()}`;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const userId = body.user_id;

  if (!userId) {
    return NextResponse.json(
      { error: "Missing user_id" },
      { status: 400 },
    );
  }

  // Request data deletion — the actual deletion is performed server-side
  // via the admin client to bypass RLS.
  try {
    const admin = createAdminClient();

    // Delete the user's profile and all related data from public tables.
    // The profiles table has ON DELETE CASCADE for jump-dependent data.
    await admin.from("profiles").delete().eq("id", userId);

    // Delete the user's auth account via the admin Auth API.
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) {
      console.error(
        `Data deletion: failed to delete auth user ${userId}:`,
        authError,
      );
    }
  } catch (err) {
    console.error(`Data deletion error for user ${userId}:`, err);
  }

  // Facebook expects this response format regardless of deletion success.
  return NextResponse.json({
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://next.uptime.pro"}/data-deletion?status=complete`,
    confirmation_code: CONFIRMATION_CODE,
  });
}

/**
 * GET — optional endpoint that users can visit to see their deletion status.
 */
export async function GET() {
  return NextResponse.json({
    message:
      "To request deletion of your data, use the Delete My Data button on your profile page, or contact support@uptime.pro.",
  });
}
