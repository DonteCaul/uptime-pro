import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ingestJumpFiles, type IngestResult } from "@/lib/dekunu/ingest";

/**
 * CSV upload endpoint — mirrors the original POST /jumps/upload.
 *
 * Accepts multipart/form-data with a `files[]` field (up to 50 .csv files,
 * 50MB each). Each file is parsed by the shared ingest pipeline and inserted
 * with per-file dedupe. Returns 207 multi-status:
 *
 *   { uploaded: <created count>, results: [{ file, status, ... }] }
 */
export const maxDuration = 60; // Allow up to 60s for large multi-file ingest

const MAX_FILES = 50;
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

  const files = formData.getAll("files[]").filter(
    (f): f is File => f instanceof File,
  );

  if (!files.length) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files (max ${MAX_FILES})` },
      { status: 400 },
    );
  }

  // 3. Read each file into memory + validate extension/size.
  const toIngest: { filename: string; buffer: Buffer }[] = [];
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      continue; // Skip non-CSV silently (matches original multer fileFilter)
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `${file.name} exceeds 50MB` },
        { status: 413 },
      );
    }
    const arrayBuffer = await file.arrayBuffer();
    toIngest.push({
      filename: file.name,
      buffer: Buffer.from(arrayBuffer),
    });
  }

  if (!toIngest.length) {
    return NextResponse.json(
      { error: "No CSV files found" },
      { status: 400 },
    );
  }

  // 4. Run the shared ingest pipeline.
  const results: IngestResult[] = await ingestJumpFiles(user.id, toIngest);
  const created = results.filter((r) => r.status === "created").length;

  return NextResponse.json(
    { uploaded: created, results },
    { status: 207 },
  );
}
