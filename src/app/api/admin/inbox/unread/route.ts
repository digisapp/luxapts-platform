import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { getAdminInboxService } from "@/lib/email/admin-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/inbox/unread — unread inbound (non-spam) count, for the sidebar badge */
export async function GET() {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);
    const count = await getAdminInboxService().getUnreadCount();
    return NextResponse.json({ count });
  } catch (error) {
    console.error("Inbox unread count error:", error);
    return apiError("Failed to count unread", 500);
  }
}
