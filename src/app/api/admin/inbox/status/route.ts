import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { getInboxStatus } from "@/lib/email/inbox-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/inbox/status[?fresh=1] — can this inbox receive mail right now? */
export async function GET(req: NextRequest) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    return NextResponse.json(await getInboxStatus({ fresh }));
  } catch (error) {
    console.error("Inbox status error:", error);
    return apiError("Status check failed", 500);
  }
}
