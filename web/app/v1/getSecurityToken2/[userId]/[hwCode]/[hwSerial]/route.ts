import { type NextRequest, NextResponse } from "next/server";
import {
  isDekunuCompatEnabled,
  makeDekunuToken,
  findUserByDekunuId,
} from "@/lib/dekunu/jwt";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /v1/getSecurityToken2/:userId/:hwCode/:hwSerial
 *
 * Device authenticates on boot. userId = Dekunu numeric id (e.g. 469). hwCode
 * and hwSerial are hardware fingerprints we don't validate.
 *
 * Returns: {"message":"Success","token":"<JWT>"}
 *
 * If the user isn't registered yet, we still return a token — the device stores
 * it and uses it for uploads. This lets devices whose owner hasn't linked their
 * account still complete the handshake.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string; hwCode: string; hwSerial: string }> },
) {
  if (!isDekunuCompatEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { userId, hwSerial } = await params;
  const dekunuUserId = parseInt(userId, 10);

  try {
    const user = await findUserByDekunuId(dekunuUserId);

    if (!user) {
      // Unknown user — return a token anyway so the device can proceed.
      const token = makeDekunuToken(dekunuUserId, 0);
      return NextResponse.json({ message: "Success", token });
    }

    // Upsert device record using hwSerial as a fingerprint.
    const admin = createAdminClient();
    const deviceSerial = (hwSerial || "unknown").replace(/,/g, "-");
    const { data: dev, error: devErr } = await admin
      .from("devices")
      .upsert(
        {
          device_id: hashSerialToInt(deviceSerial),
          last_seen_at: new Date().toISOString(),
          current_user_id: user.id,
        },
        { onConflict: "device_id" },
      )
      .select("id")
      .single();

    const dbDeviceId = (!devErr && dev?.id) || 0;
    const token = makeDekunuToken(user.uptimeUserId, dbDeviceId);
    return NextResponse.json({ message: "Success", token });
  } catch (err) {
    console.error("[DEKUNU] getSecurityToken2 error:", err);
    return NextResponse.json(
      { message: "Error", error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}

/**
 * Hash a serial string to a stable integer for the device_id column (which is
 * integer-typed). Deterministic so the same hardware re-upserts the same row.
 */
function hashSerialToInt(serial: string): number {
  let hash = 0;
  for (let i = 0; i < serial.length; i++) {
    hash = (hash * 31 + serial.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}
