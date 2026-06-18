import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ingestJumpFile, type IngestResult } from "@/lib/dekunu/ingest";

/**
 * CSV upload endpoint — accepts one .csv file per request.
 *
 * The client uploads files sequentially (one per request) so each file gets
 * its own response immediately — no timeout risk from batching 50 files.
 *
 * Accepts multipart/form-data with a `file` field. Returns 207 multi-status:
 *
 *   { results: [{ file, status, ... }] }
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

  // Accept either `file` (single-file) or `files[]` (legacy multi-file) key.
  const file = (formData.get("file") ?? formData.getAll("files[]")[0]) as
    | File
    | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file uploaded" },
      { status: 400 },
    );
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

  // 3. Read file into memory and run the ingest pipeline.
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const result: IngestResult = await ingestJumpFile(user.id, file.name, buffer);

  return NextResponse.json({ results: [result] }, { status: 207 });
}
