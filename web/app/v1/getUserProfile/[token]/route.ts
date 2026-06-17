import { type NextRequest, NextResponse } from "next/server";
import {
  isDekunuCompatEnabled,
  verifyDekunuToken,
  findUserByDekunuId,
} from "@/lib/dekunu/jwt";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /v1/getUserProfile/:token
 * Returns the userProfile JSON the device stores locally.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isDekunuCompatEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { token } = await params;
  const payload = verifyDekunuToken(token);
  if (!payload) {
    return NextResponse.json({ message: "Invalid token" }, { status: 401 });
  }

  try {
    const user = await findUserByDekunuId(payload.userId);
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("jumps")
      .select("freefall_duration_s, max_freefall_speed_ms, jumped_at")
      .eq("user_id", user.id);

    const jumps = data ?? [];
    if (error) console.warn("[DEKUNU] getUserProfile jump query:", error.message);

    const total = jumps.length;
    const totalFreefall = jumps.reduce(
      (s, j) => s + (Number(j.freefall_duration_s) || 0),
      0,
    );
    const fastest = jumps.reduce(
      (m, j) => Math.max(m, Number(j.max_freefall_speed_ms) || 0),
      0,
    );
    const lastJump = jumps
      .map((j) => j.jumped_at as string | null)
      .filter(Boolean)
      .sort()
      .pop();

    return NextResponse.json({
      dekunuUserId: user.uptimeUserId,
      fullname: user.fullName ?? "",
      nickname: user.fullName ?? "",
      email: user.email ?? "",
      token,
      jumpStats: {
        totalJumpCount: total,
        totalFreefallSecs: Math.round(totalFreefall),
        fastestVertical: fastest ? (fastest * 3.6).toFixed(1) : "0",
        lastDeviceJumpDate: lastJump ?? new Date().toISOString(),
      },
      syncStatus: {
        allJumpsSynced: true,
        jumpLogsNotSynced: 0,
      },
      fileStatus: {
        formatVer: 2,
        profileVer: 1,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[DEKUNU] getUserProfile error:", err);
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}
