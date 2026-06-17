import { type NextRequest, NextResponse } from "next/server";
import { gunzipSync } from "zlib";
import { createHash } from "crypto";
import {
  isDekunuCompatEnabled,
  verifyDekunuToken,
  findUserByDekunuId,
} from "@/lib/dekunu/jwt";
import { ingestJumpFile } from "@/lib/dekunu/ingest";

// Node runtime required for zlib + crypto + large multipart bodies.
export const runtime = "nodejs";
// Devices can upload large logs.
export const maxDuration = 60;

/**
 * POST /v1/addJumpLog/:flag/:deviceId/:token
 *
 * Multipart form, field: jumplogcsv (gzip-compressed CSV).
 * Query params: filename, gzip, actionTypeId, disciplineTypeId, userJumpNum.
 *
 * Returns: {"success":true,"message":"Log received for user X. Checksum match success.","checksum":"<sha1>"}
 *
 * Uses the shared ingestJumpFile pipeline so device-synced jumps and manual
 * uploads produce identical results.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ flag: string; deviceId: string; token: string }> },
) {
  if (!isDekunuCompatEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { token } = await params;
  const payload = verifyDekunuToken(token);
  if (!payload) {
    return NextResponse.json({ message: "Invalid token" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filename = url.searchParams.get("filename");
  const isGzip = url.searchParams.get("gzip") === "true";

  if (!filename) {
    return NextResponse.json(
      { success: false, message: "Missing filename" },
      { status: 400 },
    );
  }

  try {
    // 1. Resolve the user (must be registered — devices upload to real accounts).
    const user = await findUserByDekunuId(payload.userId);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 },
      );
    }

    // 2. Extract the CSV from multipart form data.
    const formData = await request.formData();
    const file = formData.get("jumplogcsv");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "Missing jumplogcsv field" },
        { status: 400 },
      );
    }

    let buffer = Buffer.from(await file.arrayBuffer());
    if (isGzip) {
      buffer = gunzipSync(buffer);
    }

    // 3. SHA1 checksum (matches what the real Dekunu server returned).
    const checksum = createHash("sha1").update(buffer).digest("hex");

    // 4. Ingest via the shared pipeline (dedupe + parse + insert + archive).
    //    The pipeline is idempotent — a duplicate upload returns 'duplicate'
    //    without erroring, which is what the device expects.
    const result = await ingestJumpFile(user.id, filename, buffer);

    if (result.status === "error") {
      console.error("[DEKUNU] addJumpLog ingest failed:", result.error);
      return NextResponse.json(
        { success: false, message: result.error ?? "Ingest failed" },
        { status: 500 },
      );
    }

    console.log(
      `[DEKUNU] addJumpLog: ${filename} → ${result.status} (jump ${result.jump_id ?? "-"}) for user ${user.id}`,
    );

    return NextResponse.json({
      success: true,
      message: `Log received for user ${payload.userId}. Checksum match success.`,
      checksum,
    });
  } catch (err) {
    console.error("[DEKUNU] addJumpLog error:", err);
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
