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

/**
 * Verify a Facebook signed request (HMAC-SHA256).
 * Facebook signs deletion callbacks with the app secret to prevent spoofing.
 */
function verifySignedRequest(
  signedRequest: string,
  appSecret: string,
): Record<string, string> | null {
  const [encodedSig, encodedPayload] = signedRequest.split(".");
  if (!encodedSig || !encodedPayload) return null;

  // Base64url-decode
  const sig = Buffer.from(
    encodedSig.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );
  const payload = Buffer.from(
    encodedPayload.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );

  const crypto = require("crypto");
  const expectedSig = crypto
    .createHmac("sha256", appSecret)
    .update(encodedPayload)
    .digest();

  if (!crypto.timingSafeEqual(sig, expectedSig)) return null;

  try {
    return JSON.parse(payload.toString("utf-8"));
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const body = await request.json();

  // Option 1: Signed request (standard Facebook pattern)
  let userId: string | undefined;
  let confirmationCode: string;

  if (body.signed_request && appSecret) {
    const payload = verifySignedRequest(body.signed_request, appSecret);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 },
      );
    }
    userId = payload.user_id;
    confirmationCode = `deletion_${payload.user_id}_${Date.now()}`;
  } else {
    // Option 2: Direct user_id — require server-side auth to prevent abuse.
    // This path is only used when called internally (not from Facebook).
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    // If user_id is provided, verify the caller is an admin OR deleting themselves.
    userId = body.user_id;
    if (!userId) {
      return NextResponse.json(
        { error: "Missing user_id" },
        { status: 400 },
      );
    }
    // Non-admins can only delete themselves.
    if (user.id !== userId) {
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
    }
    confirmationCode = `deletion_${userId}_${Date.now()}`;
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
    confirmation_code: confirmationCode,
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
