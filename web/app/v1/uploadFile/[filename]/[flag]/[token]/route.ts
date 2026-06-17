import { type NextRequest, NextResponse } from "next/server";
import {
  isDekunuCompatEnabled,
  verifyDekunuToken,
  findUserByDekunuId,
} from "@/lib/dekunu/jwt";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /v1/uploadFile/:filename/:flag/:token
 *
 * Stage 2 of device sync: uploads the JSON summary file. We accept and discard
 * it (the CSV is the source of truth). Returns the jump id as actionId.
 *
 * Returns: {"success":true,"actionId":<number>}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string; flag: string; token: string }> },
) {
  if (!isDekunuCompatEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { filename, token } = await params;
  const payload = verifyDekunuToken(token);
  if (!payload) {
    return NextResponse.json({ message: "Invalid token" }, { status: 401 });
  }

  try {
    // Drain the multipart body so the device's upload completes cleanly.
    await request.formData().catch(() => {});

    // Look up the jump by filename to return its id as actionId.
    const user = await findUserByDekunuId(payload.userId);
    const csvFilename = filename.replace(/\.json$/i, ".csv");
    let actionId = Math.floor(Math.random() * 9_000_000) + 1_000_000;

    if (user) {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("jumps")
        .select("id")
        .eq("user_id", user.id)
        .eq("filename", csvFilename)
        .maybeSingle();
      if (!error && data?.id) actionId = data.id;
    }

    console.log(
      `[DEKUNU] uploadFile (summary): ${filename} → actionId ${actionId}`,
    );
    return NextResponse.json({ success: true, actionId });
  } catch (err) {
    console.error("[DEKUNU] uploadFile error:", err);
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
