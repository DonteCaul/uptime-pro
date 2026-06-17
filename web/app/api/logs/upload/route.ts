import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/db/types";

/**
 * System log upload — mirrors the original POST /logs/upload.
 *
 * Accepts multipart/form-data:
 *   - files[]: one or more .txt files (syslog or syslog_esp32)
 *   - device_id (optional): Dekunu device id to associate
 *
 * Parses the filename to extract the log source + number:
 *   syslog.N.txt        → source='syslog',       log_number=N
 *   syslog_esp32.N.txt  → source='syslog_esp32', log_number=N
 *
 * Returns 201 with a per-file result list.
 */
const MAX_FILES = 50;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type SystemLogInsert =
  Database["public"]["Tables"]["system_logs"]["Insert"];

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const files = formData
    .getAll("files[]")
    .filter((f): f is File => f instanceof File);
  const deviceIdRaw = formData.get("device_id");

  if (!files.length) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files (max ${MAX_FILES})` },
      { status: 400 },
    );
  }

  // Resolve the optional device_id → internal devices.id.
  let dbDeviceId: number | null = null;
  if (deviceIdRaw && typeof deviceIdRaw === "string") {
    const { data: dev } = await supabase
      .from("devices")
      .select("id")
      .eq("device_id", parseInt(deviceIdRaw, 10))
      .maybeSingle();
    dbDeviceId = (dev as { id: number } | null)?.id ?? null;
  }

  const results: { file: string; source: string; log_number: number | null }[] =
    [];

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".txt")) continue;
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `${file.name} exceeds 10MB` },
        { status: 413 },
      );
    }

    // Parse filename: syslog.N.txt or syslog_esp32.N.txt (optionally .last)
    const match = file.name.match(
      /^(syslog(?:_esp32)?)(?:\.(\d+))?\.txt(?:\.last)?$/,
    );
    const source = match ? match[1] : "syslog";
    const logNumber = match && match[2] ? parseInt(match[2], 10) : null;

    const text = await file.text();

    const insert: SystemLogInsert = {
      device_id: dbDeviceId,
      user_id: user.id,
      log_source: source,
      log_number: logNumber,
      content: text,
    };

    const { error } = await supabase.from("system_logs").insert(insert);
    if (error) {
      console.warn(`[logs] insert failed for ${file.name}: ${error.message}`);
    }

    results.push({ file: file.name, source, log_number: logNumber });
  }

  if (!results.length) {
    return NextResponse.json(
      { error: "No .txt files found" },
      { status: 400 },
    );
  }

  return NextResponse.json({ uploaded: results.length, results }, { status: 201 });
}
