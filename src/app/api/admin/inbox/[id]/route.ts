import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID } from "@/lib/utils";
import { getAdminInboxService } from "@/lib/email/admin-inbox";
import { logAuditEvent, AuditAction } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/admin/inbox/[id] — one email plus its thread (does not mark read; the UI does that explicitly). */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { id } = await params;
    if (!isValidUUID(id)) return apiError("Email not found", 404);

    const inbox = getAdminInboxService();
    const email = await inbox.getEmail(id);
    if (!email) return apiError("Email not found", 404);

    const thread = await inbox.getThread(email.threadId);
    return NextResponse.json({ email, thread: thread.length ? thread : [email] });
  } catch (error) {
    console.error("Get inbox email error:", error);
    return apiError("Failed to open email", 500);
  }
}

/** PATCH /api/admin/inbox/[id] — { isRead | isStarred | isSpam } flags, or { useAiDraft: true } to send the AI draft */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { id } = await params;
    if (!isValidUUID(id)) return apiError("Email not found", 404);
    const body = await req.json().catch(() => ({}));
    const inbox = getAdminInboxService();

    if (body.useAiDraft === true) {
      const email = await inbox.getEmail(id);
      if (!email) return apiError("Email not found", 404);
      if (email.direction !== "inbound") return apiError("Only inbound mail has a draft");
      if (!email.aiDraftText || !email.aiDraftHtml) return apiError("No AI draft available");
      if (email.status === "replied") return apiError("This email was already answered", 409);

      const result = await inbox.sendNewEmail({
        to: email.fromAddress,
        subject: /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`,
        bodyHtml: email.aiDraftHtml,
        bodyText: email.aiDraftText,
        replyToEmailId: id,
        sentBy: auth.userId,
      });
      if (!result.success) return apiError(result.error, result.status ?? 502);

      void logAuditEvent(auth.userId, AuditAction.INBOX_SEND_AI_DRAFT, "email", result.id, {
        to: email.fromAddress,
        inReplyTo: id,
      });
      return NextResponse.json({ success: true, sent: true, id: result.id });
    }

    const flags: Array<[string, (_v: boolean) => Promise<void>]> = [
      ["isRead", (v) => inbox.markRead(id, v)],
      ["isStarred", (v) => inbox.setStar(id, v)],
      ["isSpam", (v) => inbox.markSpam(id, v)],
    ];
    let touched = 0;
    for (const [key, apply] of flags) {
      if (typeof body[key] === "boolean") {
        await apply(body[key]);
        touched++;
      }
    }
    if (touched === 0) return apiError("Nothing to update");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update inbox email error:", error);
    const message = error instanceof Error ? error.message : "";
    return apiError(/migration 029/.test(message) ? message : "Update failed", 500);
  }
}

/** DELETE /api/admin/inbox/[id] */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { id } = await params;
    if (!isValidUUID(id)) return apiError("Email not found", 404);

    await getAdminInboxService().deleteEmail(id);
    void logAuditEvent(auth.userId, AuditAction.INBOX_DELETE, "email", id, {});
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete inbox email error:", error);
    return apiError("Delete failed", 500);
  }
}
