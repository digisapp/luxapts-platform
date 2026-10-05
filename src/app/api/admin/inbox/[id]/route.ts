import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID } from "@/lib/utils";
import { getAdminInboxService } from "@/lib/email/admin-inbox";
import { logAuditEvent, AuditAction } from "@/lib/admin/audit";
import { classifyAndDraftReply } from "@/lib/ai-email";
import { draftContextFor } from "@/lib/leads/draft-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/inbox/[id] — one email, its thread, and the lead behind the
 * conversation (for the lead card). Does not mark read; the UI does that.
 */
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
    const messages = thread.length ? thread : [email];
    // Any message in the thread may carry the lead (the first note does).
    const leadId = email.leadId ?? messages.find((m) => m.leadId)?.leadId ?? null;
    const lead = await inbox.getLeadContext(leadId).catch(() => null);
    return NextResponse.json({ email, thread: messages, lead });
  } catch (error) {
    console.error("Get inbox email error:", error);
    return apiError("Failed to open email", 500);
  }
}

/**
 * PATCH /api/admin/inbox/[id] — { isRead | isStarred | isSpam } flags,
 * { useAiDraft: true } to send the AI draft, or { regenerateDraft: true } to
 * write a fresh draft with the lead's and building's current facts.
 */
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

    if (body.regenerateDraft === true) {
      const email = await inbox.getEmail(id);
      if (!email) return apiError("Email not found", 404);
      if (email.direction !== "inbound") return apiError("Only inbound mail has a draft");
      if (!process.env.XAI_API_KEY) return apiError("AI drafts are not configured", 503);

      const thread = await inbox.getThread(email.threadId);
      const leadId = email.leadId ?? thread.find((m) => m.leadId)?.leadId ?? null;
      const lead = await inbox.getLeadContext(leadId).catch(() => null);
      const result = await classifyAndDraftReply(
        { from: email.fromAddress, fromName: email.fromName, subject: email.subject, text: email.bodyText, html: email.bodyHtml },
        draftContextFor(lead)
      );
      await inbox.updateAiFields(id, {
        aiCategory: result.category,
        aiConfidence: result.confidence,
        aiSummary: result.summary,
        aiDraftText: result.draftText,
        aiDraftHtml: result.draftHtml,
      });
      return NextResponse.json({ success: true, email: await inbox.getEmail(id) });
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
