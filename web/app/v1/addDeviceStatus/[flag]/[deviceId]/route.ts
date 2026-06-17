import { type NextRequest, NextResponse } from "next/server";
import { isDekunuCompatEnabled } from "@/lib/dekunu/jwt";

/**
 * POST /v1/addDeviceStatus/:flag/:deviceId
 * Periodic heartbeat from device — just acknowledge.
 *
 * No token in the URL (matches original), so no auth check beyond the flag.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ flag: string; deviceId: string }> },
) {
  if (!isDekunuCompatEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Touch params so the linter doesn't complain about unused route segments.
  void params;
  return NextResponse.json({ success: true });
}
