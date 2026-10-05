import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID, safeParseInt } from "@/lib/utils";
import { checkOutgoingAttachments, getAdminInboxService, isBulkAction, isInboxFolder } from "@/lib/email/admin-inbox";
import { htmlToText, textToHtml } from "@/lib/email/branded";
import { logAuditEvent, AuditAction } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function idList(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 200) return null;
  const ids = v.filter((x): x is string => typeof x === "string" && isValidUUID(x));
  return ids.length === v.length ? ids : null;
}

/** GET /api/admin/inbox?folder=inbox|unread|starred|sent|spam&search=&page=&limit= */
export async function GET(req: NextRequest) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { searchParams } = req.nextUrl;
    const folderParam = searchParams.get("folder") || "inbox";
    const folder = isInboxFolder(folderParam) ? folderParam : "inbox";
    const search = (searchParams.get("search") || "").slice(0, 200);
    const page = safeParseInt(searchParams.get("page"), 1, 1, 100_000);
    const limit = safeParseInt(searchParams.get("limit"), 25, 1, 50);

    const inbox = getAdminInboxService();
    const [list, counts] = await Promise.all([
      inbox.listEmails({ folder, search: search || undefined, page, limit }),
      inbox.getFolderCounts(),
    ]);
    return NextResponse.json({ ...list, folder, counts });
  } catch (error) {
    console.error("List inbox error:", error);
    return apiError("Failed to load emails", 500);
  }
}

/** POST /api/admin/inbox — compose or reply { to, subject, bodyText, bodyHtml?, replyToEmailId? } */
export async function POST(req: NextRequest) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const body = await req.json().catch(() => ({}));
    const to = typeof body.to === "string" ? body.to : "";
    const subject = typeof body.subject === "string" ? body.subject : "";
    const rawHtml = typeof body.bodyHtml === "string" && body.bodyHtml.trim() ? body.bodyHtml : "";
    const bodyText = typeof body.bodyText === "string" && body.bodyText.trim() ? body.bodyText : rawHtml ? htmlToText(rawHtml) : "";
    const bodyHtml = rawHtml || textToHtml(bodyText);
    const replyToEmailId =
      typeof body.replyToEmailId === "string" && isValidUUID(body.replyToEmailId) ? body.replyToEmailId : undefined;

    if (!to.trim() || !subject.trim() || !bodyText.trim()) {
      return apiError("To, subject and message are required");
    }
    const files = checkOutgoingAttachments(body.attachments);
    if (!files.ok) return apiError(files.error);

    const result = await getAdminInboxService().sendNewEmail({
      to,
      subject,
      bodyHtml,
      bodyText,
      replyToEmailId,
      sentBy: auth.userId,
      attachments: files.files,
    });
    if (!result.success) return apiError(result.error, result.status ?? 502);

    void logAuditEvent(auth.userId, replyToEmailId ? AuditAction.INBOX_REPLY : AuditAction.INBOX_SEND, "email", result.id, {
      to: to.trim().toLowerCase(),
      subject: subject.trim().slice(0, 200),
      replyToEmailId: replyToEmailId ?? null,
    });

    return NextResponse.json({ success: true, id: result.id, threadId: result.threadId });
  } catch (error) {
    console.error("Send inbox email error:", error);
    return apiError("Failed to send email", 500);
  }
}

/** PUT /api/admin/inbox — bulk actions { ids, action } */
export async function PUT(req: NextRequest) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const body = await req.json().catch(() => ({}));
    const ids = idList(body.ids);
    if (!ids) return apiError("ids must be 1–200 email ids");
    if (!isBulkAction(body.action)) return apiError("Unknown action");
    if (body.action === "delete") return apiError("Use DELETE for deletions");

    await getAdminInboxService().bulk(body.action, ids);
    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    console.error("Bulk inbox action error:", error);
    const message = error instanceof Error ? error.message : "";
    return apiError(/migration 029/.test(message) ? message : "Action failed", 500);
  }
}

/** DELETE /api/admin/inbox — bulk delete { ids } */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const body = await req.json().catch(() => ({}));
    const ids = idList(body.ids);
    if (!ids) return apiError("ids must be 1–200 email ids");

    await getAdminInboxService().bulk("delete", ids);
    void logAuditEvent(auth.userId, AuditAction.INBOX_DELETE, "email", ids[0], { ids, count: ids.length });
    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error) {
    console.error("Bulk inbox delete error:", error);
    return apiError("Delete failed", 500);
  }
}
