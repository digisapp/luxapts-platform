import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";
import { getAdminInboxService } from "@/lib/email/admin-inbox";
import { getInboundAddress, isValidEmail } from "@/lib/email/inbound-address";
import { escapeHtml } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/inbox/test — send a round-trip test to the signed-in admin.
 *
 * Proves the whole loop, not just sending: the mail goes out through the
 * normal reply path (hello@ From, per-thread Reply-To), so replying to it
 * from the admin's own mailbox must land back in /admin/email under the same
 * thread. If the reply never shows up, receiving (DNS / webhook) is the part
 * that's broken — see /api/admin/inbox/status.
 */
export async function POST() {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { data: userRes } = await createAdminClient().auth.admin.getUserById(auth.userId);
    const to = (userRes?.user?.email || "").trim().toLowerCase();
    if (!isValidEmail(to)) return apiError("Your admin account has no email address to send to");

    const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
    const inbound = getInboundAddress();
    const subject = `Staycio inbox test · ${stamp}`;
    const text = [
      "This is a test from the Staycio admin inbox.",
      "",
      "Reply to this email. Your reply should appear in /admin/email within a minute, in the same thread as this message.",
      "",
      `Replies are routed through ${inbound} (per-thread plus address). If nothing arrives, receiving is not set up yet — the Email page shows what is missing.`,
      "",
      "— Staycio",
    ].join("\n");
    const html = `<p>This is a test from the <strong>Staycio admin inbox</strong>.</p>
<p><strong>Reply to this email.</strong> Your reply should appear in <code>/admin/email</code> within a minute, in the same thread as this message.</p>
<p style="color:#9ca3af;font-size:13px;">Replies are routed through ${escapeHtml(inbound)} (per-thread plus address). If nothing arrives, receiving is not set up yet — the Email page shows what is missing.</p>
<p>— Staycio</p>`;

    const result = await getAdminInboxService().sendNewEmail({
      to,
      subject,
      bodyText: text,
      bodyHtml: html,
      sentBy: auth.userId,
      test: true,
    });
    if (!result.success) return apiError(result.error, result.status ?? 502);
    return NextResponse.json({ success: true, to, id: result.id, threadId: result.threadId });
  } catch (error) {
    console.error("Inbox test send error:", error);
    return apiError("Test send failed", 500);
  }
}
