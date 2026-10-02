import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { getAdminInboxService, isInboxSettingKey } from "@/lib/email/admin-inbox";
import { logAuditEvent, AuditAction } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only the inbox's own keys (see INBOX_SETTING_KEYS) — this is not a general
// platform_settings editor; that is /api/admin/settings.

/** GET /api/admin/inbox/settings?key=ai_auto_reply_enabled */
export async function GET(req: NextRequest) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const key = req.nextUrl.searchParams.get("key");
    if (!isInboxSettingKey(key)) return apiError("Unknown setting");
    const value = await getAdminInboxService().getSetting(key);
    return NextResponse.json({ key, value });
  } catch (error) {
    console.error("Inbox setting read error:", error);
    return apiError("Failed to read setting", 500);
  }
}

/** PUT /api/admin/inbox/settings { key, value: boolean } */
export async function PUT(req: NextRequest) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const body = await req.json().catch(() => ({}));
    if (!isInboxSettingKey(body.key)) return apiError("Unknown setting");
    if (typeof body.value !== "boolean") return apiError("value must be true or false");

    await getAdminInboxService().setSetting(body.key, body.value);
    void logAuditEvent(auth.userId, AuditAction.INBOX_SETTING, "platform_setting", auth.userId, {
      key: body.key,
      value: body.value,
    });
    return NextResponse.json({ success: true, key: body.key, value: body.value });
  } catch (error) {
    console.error("Inbox setting write error:", error);
    return apiError("Failed to save setting", 500);
  }
}
