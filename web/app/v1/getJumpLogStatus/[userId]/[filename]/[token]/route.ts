import { type NextRequest, NextResponse } from "next/server";
import {
  isDekunuCompatEnabled,
  verifyDekunuToken,
  findUserByDekunuId,
} from "@/lib/dekunu/jwt";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /v1/getJumpLogStatus/:userId/:filename/:token
 * Device checks if a log file already exists before uploading.
 *
 * NOTE: the [filename] segment captures only the last path component. If the
 * device sends a filename with slashes, they'd need URL encoding. In practice
 * Dekunu filenames are flat (action_<id>_<date>_<time>-<type>.csv).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; filename: string; token: string }> },
) {
  if (!isDekunuCompatEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { userId, filename, token } = await params;
  const payload = verifyDekunuToken(token);
  if (!payload) {
    return NextResponse.json({ message: "Invalid token" }, { status: 401 });
  }

  try {
    const user = await findUserByDekunuId(parseInt(userId, 10));
    if (!user) {
      return NextResponse.json({ jumpLogOnServer: false });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("jumps")
      .select("id")
      .eq("user_id", user.id)
      .eq("filename", filename)
      .maybeSingle();

    if (error) console.warn("[DEKUNU] getJumpLogStatus:", error.message);
    return NextResponse.json({ jumpLogOnServer: !!data });
  } catch (err) {
    console.error("[DEKUNU] getJumpLogStatus error:", err);
    return NextResponse.json({ jumpLogOnServer: false });
  }
}
