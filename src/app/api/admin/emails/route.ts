import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { getResendClient, getFromEmail } from "@/lib/resend/client";
import { buildBrandedTemplate } from "@/lib/ai-email";
import { apiError } from "@/lib/api-helpers";
import crypto from "crypto";

const PAGE_SIZE = 30;

/**
 * GET /api/admin/emails
 * List emails with filtering by direction, search, starred, AI category, pagination
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error, auth.status);
    }

    const { searchParams } = req.nextUrl;
    const view = searchParams.get("view") || "inbox";
    const search = searchParams.get("search") || "";
    const starred = searchParams.get("starred") === "true";
    const category = searchParams.get("category") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = PAGE_SIZE;
    const offset = (page - 1) * limit;

    const supabase = createAdminClient();

    let query = supabase
      .from("emails")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (view === "inbox") {
      query = query.eq("direction", "inbound");
    } else if (view === "sent") {
      query = query.eq("direction", "outbound");
    }

    if (starred) {
      query = query.eq("is_starred", true);
    }

    if (category) {
      query = query.eq("ai_category", category);
    }

    if (search) {
      // Sanitize search input to prevent wildcard/filter injection
      const sanitized = search.replace(/[%_\\,()]/g, "");
      if (sanitized.length > 0) {
        query = query.or(
          `subject.ilike.%${sanitized}%,from_email.ilike.%${sanitized}%,from_name.ilike.%${sanitized}%,to_email.ilike.%${sanitized}%`
        );
      }
    }

    const { data: emails, count, error } = await query;

    if (error) {
      console.error("Fetch emails error:", error);
      return apiError("Failed to fetch emails", 500);
    }

    // Unread count = inbound emails with status 'received' (no read_at)
    const { count: unreadCount } = await supabase
      .from("emails")
      .select("*", { count: "exact", head: true })
      .eq("direction", "inbound")
      .eq("status", "received");

    return NextResponse.json({
      emails: emails || [],
      total: count || 0,
      unread: unreadCount || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error("List emails error:", error);
    return apiError("Internal server error", 500);
  }
}

/**
 * POST /api/admin/emails
 * Send a new email or reply to a thread. Uses branded Staycio template.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error, auth.status);
    }

    const body = await req.json();
    const { to, subject, bodyHtml, threadId, leadId } = body as {
      to: string;
      subject: string;
      bodyHtml: string;
      threadId?: string;
      leadId?: string;
    };

    if (!to || !subject || !bodyHtml) {
      return apiError("to, subject, and bodyHtml are required");
    }

    // Send via Resend with branded template
    const resend = getResendClient();
    const fromEmail = getFromEmail();
    const brandedHtml = buildBrandedTemplate(bodyHtml);

    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject,
      html: brandedHtml,
      text: bodyHtml.replace(/<[^>]*>/g, ""),
    });

    if (sendError) {
      console.error("Resend send error:", sendError);
      return apiError("Failed to send email", 500);
    }

    const supabase = createAdminClient();
    const finalThreadId = threadId || crypto.randomUUID();

    // Extract from name/email
    const fromMatch = fromEmail.match(/^(.+?)\s*<(.+?)>$/);
    const fromName = fromMatch ? fromMatch[1].trim() : "Staycio";
    const fromAddr = fromMatch ? fromMatch[2].trim() : fromEmail;

    // Resolve lead
    let resolvedLeadId = leadId || null;
    if (!resolvedLeadId) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .eq("user_email", to)
        .limit(1)
        .maybeSingle();
      if (lead) resolvedLeadId = lead.id;
    }

    // If reply, mark inbound emails in thread as "replied"
    if (threadId) {
      await supabase
        .from("emails")
        .update({
          status: "replied",
          replied_at: new Date().toISOString(),
        })
        .eq("thread_id", threadId)
        .eq("direction", "inbound")
        .in("status", ["received", "read"]);
    }

    const { data: email, error: insertError } = await supabase
      .from("emails")
      .insert({
        thread_id: finalThreadId,
        direction: "outbound",
        status: "sent",
        resend_message_id: sendResult?.id || null,
        from_email: fromAddr,
        from_name: fromName,
        to_email: to,
        subject,
        body_html: bodyHtml,
        body_text: bodyHtml.replace(/<[^>]*>/g, ""),
        lead_id: resolvedLeadId,
        is_starred: false,
        sent_by: auth.userId || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Store sent email error:", insertError);
      return apiError("Email sent but failed to save record", 500);
    }

    return NextResponse.json({ success: true, email, thread_id: finalThreadId });
  } catch (error) {
    console.error("Send email error:", error);
    return apiError("Internal server error", 500);
  }
}

/**
 * PATCH /api/admin/emails (bulk actions)
 * Body: { ids: string[], action: "mark_read" | "mark_unread" | "star" | "unstar" | "delete" }
 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error, auth.status);
    }

    const { ids, action } = (await req.json()) as {
      ids: string[];
      action: "mark_read" | "mark_unread" | "star" | "unstar" | "delete";
    };

    if (!ids?.length || !action) {
      return apiError("ids and action are required");
    }

    const supabase = createAdminClient();

    if (action === "delete") {
      await supabase.from("emails").delete().in("id", ids);
      return NextResponse.json({ success: true, deleted: ids.length });
    }

    if (action === "mark_read") {
      // Only mark inbound emails with status 'received' as read
      await supabase
        .from("emails")
        .update({ status: "read", read_at: new Date().toISOString() })
        .in("id", ids)
        .eq("direction", "inbound")
        .eq("status", "received");
      return NextResponse.json({ success: true, updated: ids.length });
    }

    if (action === "mark_unread") {
      // Only revert inbound emails to 'received'
      await supabase
        .from("emails")
        .update({ status: "received", read_at: null })
        .in("id", ids)
        .eq("direction", "inbound")
        .in("status", ["read", "replied"]);
      return NextResponse.json({ success: true, updated: ids.length });
    }

    const updates: Record<string, unknown> = {};
    if (action === "star") {
      updates.is_starred = true;
    } else if (action === "unstar") {
      updates.is_starred = false;
    }

    await supabase.from("emails").update(updates).in("id", ids);

    return NextResponse.json({ success: true, updated: ids.length });
  } catch (error) {
    console.error("Bulk action error:", error);
    return apiError("Internal server error", 500);
  }
}
