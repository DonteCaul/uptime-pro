import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/db/types";
import { getPostHogClient } from "@/lib/posthog-server";

/**
 * System log upload — accepts one .txt file per request.
 *
 * Accepts multipart/form-data:
 *   - file: one .txt file (syslog or syslog_esp32)
 *   - device_id (optional): Dekunu device id to associate
 *
 * Parses the filename to extract the log source + number:
 *   syslog.N.txt        → source='syslog',       log_number=N
 *   syslog_esp32.N.txt  → source='syslog_esp32', log_number=N
 *
 * Returns 201 with a per-file result.
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type SystemLogInsert = Database["public"]["Tables"]["system_logs"]["Insert"];

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

  // Accept either `file` (single-file) or `files[]` (legacy multi-file) key.
  const file = (formData.get("file") ??
    formData.getAll("files[]")[0]) as File | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".txt")) {
    return NextResponse.json(
      { error: "Only .txt files are accepted" },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `${file.name} exceeds 10MB` },
      { status: 413 },
    );
  }

  // Resolve the optional device_id → internal devices.id.
  const deviceIdRaw = formData.get("device_id");
  let dbDeviceId: number | null = null;
  if (deviceIdRaw && typeof deviceIdRaw === "string") {
    const { data: dev } = await supabase
      .from("devices")
      .select("id")
      .eq("device_id", parseInt(deviceIdRaw, 10))
      .maybeSingle();
    dbDeviceId = (dev as { id: number } | null)?.id ?? null;
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
    return NextResponse.json(
      { error: `Insert failed: ${error.message}` },
      { status: 500 },
    );
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "log_ingested",
    properties: {
      file: file.name,
      source,
      log_number: logNumber,
      has_device: !!dbDeviceId,
    },
  });

  return NextResponse.json(
    {
      results: [{ file: file.name, source, log_number: logNumber }],
    },
    { status: 201 },
  );
}
