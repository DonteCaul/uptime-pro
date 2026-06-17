import { type NextRequest, NextResponse } from "next/server";
import { isDekunuCompatEnabled, verifyDekunuToken } from "@/lib/dekunu/jwt";

/**
 * POST /v1/checkDeviceStatus/:token
 * Device checks if firmware updates are needed — tell it everything is current.
 */
export async function POST(
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

  return NextResponse.json({
    firmwareUpdateRequired: false,
    espFirmwareUpdateRequired: false,
    bootloaderUpdateRequired: false,
    resPackUpdateRequired: false,
    serialNumMatch: true,
    isMilitaryDevice: false,
    latestSysConfigVer: "1.0.0",
    latestQuotesVer: "1.0.0",
    latestPlaneAlertsVer: "1.0.0",
  });
}
