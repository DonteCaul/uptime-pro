import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ingestJumpFile, type IngestResult } from "@/lib/dekunu/ingest";
import { getPostHogClient } from "@/lib/posthog-server";

/**
 * CSV + JSON summary upload endpoint — accepts one jump pair per request.
 *
 * The client uploads files via a worker pool (3 concurrent) so each request
 * processes exactly one jump and returns immediately.
 *
 * Accepts multipart/form-data with:
 *   - `file` (required): the .csv action log
 *   - `summary` (optional): the matching .json summary
 *
 * When both are provided, the summary's device-calculated values are used
 * for jump metadata (more accurate). The CSV is used for raw sensor rows.
 *
 * Returns 207 multi-status: { results: [{ file, status, ... }] }
 */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export async function POST(request: NextRequest) {
  // 1. Resolve the signed-in user.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse multipart form data.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = (formData.get("file") ??
    formData.getAll("files[]")[0]) as File | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json(
      { error: "Only .csv files are accepted" },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `${file.name} exceeds 50MB` },
      { status: 413 },
    );
  }

  // 3. Read CSV into memory.
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 4. Optionally read the paired summary JSON.
  const summaryField = formData.get("summary");
  let summaryBuffer: Buffer | undefined;
  if (summaryField instanceof File) {
    summaryBuffer = Buffer.from(await summaryField.arrayBuffer());
  }

  // 5. Run the ingest pipeline.
  const result: IngestResult = await ingestJumpFile(
    user.id,
    file.name,
    buffer,
    summaryBuffer,
  );

  if (result.status === "created") {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "jump_ingested",
      properties: {
        file: result.file,
        exit_altitude_m: result.meta?.exit_altitude_m ?? null,
        freefall_duration_s: result.meta?.freefall_duration_s ?? null,
        has_summary: !!summaryBuffer,
      },
    });
  }

  return NextResponse.json({ results: [result] }, { status: 207 });
}
