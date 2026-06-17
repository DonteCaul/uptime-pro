import { type NextRequest, NextResponse } from "next/server";
import { isDekunuCompatEnabled } from "@/lib/dekunu/jwt";

/**
 * Catch-all for unhandled /v1/* routes.
 *
 * The device firmware hits endpoints we haven't reverse-engineered yet. Rather
 * than 404 (which may cause the device to retry indefinitely), return success
 * and log so we can identify and implement missing endpoints over time.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ catchall?: string[] }> },
) {
  return handle(request, params, "GET");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ catchall?: string[] }> },
) {
  return handle(request, params, "POST");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ catchall?: string[] }> },
) {
  return handle(request, params, "PUT");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ catchall?: string[] }> },
) {
  return handle(request, params, "DELETE");
}

async function handle(
  request: NextRequest,
  params: Promise<{ catchall?: string[] }>,
  method: string,
) {
  const { catchall } = await params;
  const path = catchall?.join("/") ?? "";

  if (!isDekunuCompatEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  console.warn(`[DEKUNU] Unhandled ${method} /v1/${path}`);
  return NextResponse.json({ success: true, message: "ok" });
}
