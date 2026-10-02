import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID } from "@/lib/utils";
import { getAdminInboxService } from "@/lib/email/admin-inbox";
import { getResendClient } from "@/lib/resend/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/inbox/[id]/attachments/[attachmentId]
 *
 * Attachment bytes never touch our storage: Resend keeps them with the
 * received email and hands out a short-lived download URL. We look the
 * attachment up (admin-only, only ids we recorded from the webhook) and
 * redirect to that URL.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { id, attachmentId } = await params;
    if (!isValidUUID(id)) return apiError("Attachment not found", 404);
    if (!process.env.RESEND_API_KEY) return apiError("Resend is not configured", 503);

    const email = await getAdminInboxService().getEmail(id);
    if (!email || email.direction !== "inbound" || !email.resendEmailId) {
      return apiError("Attachment not found", 404);
    }
    // Only ids we recorded from the webhook — never a free lookup on Resend.
    if (!email.attachments.some((a) => a.id === attachmentId)) {
      return apiError("Attachment not found", 404);
    }

    const { data, error } = await getResendClient().emails.receiving.attachments.get({
      emailId: email.resendEmailId,
      id: attachmentId,
    });
    if (error || !data?.download_url) {
      console.error("[Inbox] attachment lookup failed:", error?.message);
      return apiError("Attachment is no longer available", 502);
    }

    return NextResponse.redirect(data.download_url, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Inbox attachment error:", error);
    return apiError("Attachment is no longer available", 500);
  }
}
