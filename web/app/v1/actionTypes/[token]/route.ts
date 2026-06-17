import { type NextRequest, NextResponse } from "next/server";
import { isDekunuCompatEnabled, verifyDekunuToken } from "@/lib/dekunu/jwt";

/**
 * GET /v1/actionTypes/:token
 * Device fetches action type definitions — return the known set.
 */
export async function GET(
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
    actionTypes: [
      { id: 240, name: "Skydive", description: "Standard skydive" },
      { id: 300, name: "BASE", description: "BASE jump" },
      { id: 310, name: "Wingsuit BASE", description: "Wingsuit BASE jump" },
    ],
  });
}
