import { type NextRequest, NextResponse } from "next/server";
import { isDekunuCompatEnabled, verifyDekunuToken } from "@/lib/dekunu/jwt";

/**
 * GET /v1/getDzWeather/:dzId/:token
 * Minimal weather stub — the device displays it. (The original also returned null.)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dzId: string; token: string }> },
) {
  if (!isDekunuCompatEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { token } = await params;
  const payload = verifyDekunuToken(token);
  if (!payload) {
    return NextResponse.json({ message: "Invalid token" }, { status: 401 });
  }

  return NextResponse.json({ success: true, weather: null });
}
