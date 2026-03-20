import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { getResendClient, getFromEmail } from "@/lib/resend/client";
import { apiError } from "@/lib/api-helpers";
import crypto from "crypto";

const PAGE_SIZE = 30;

/**
 * GET /api/admin/emails
 * List emails with filtering by direction (inbox/sent), read status, search
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
    const unreadOnly = searchParams.get("unread") === "true";
    const starred = searchParams.get("starred") === "true";
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

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    if (starred) {
      query = query.eq("is_starred", true);
    }

    if (search) {
      query = query.or(
        `subject.ilike.%${search}%,from_email.ilike.%${search}%,from_name.ilike.%${search}%,to_email.ilike.%${search}%`
      );
    }

    const { data: emails, count, error } = await query;

    if (error) {
      console.error("Fetch emails error:", error);
      return apiError("Failed to fetch emails", 500);
    }

    // Get unread count for badge
    const { count: unreadCount } = await supabase
      .from("emails")
      .select("*", { count: "exact", head: true })
      .eq("direction", "inbound")
      .eq("is_read", false);

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
 * Send a new email (compose) or reply to a thread
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

    // Send via Resend
    const resend = getResendClient();
    const fromEmail = getFromEmail();

    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          ${bodyHtml}
          <p style="margin-top: 24px; color: #666; font-size: 12px;">
            — The LuxApts Team
          </p>
        </div>
      `,
    });

    if (sendError) {
      console.error("Resend send error:", sendError);
      return apiError("Failed to send email", 500);
    }

    const supabase = createAdminClient();
    const finalThreadId = threadId || crypto.randomUUID();

    // Extract from name/email
    const fromMatch = fromEmail.match(/^(.+?)\s*<(.+?)>$/);
    const fromName = fromMatch ? fromMatch[1].trim() : "LuxApts";
    const fromAddr = fromMatch ? fromMatch[2].trim() : fromEmail;

    // Resolve lead
    let resolvedLeadId = leadId || null;
    if (!resolvedLeadId) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .eq("user_email", to)
        .limit(1)
        .single();
      if (lead) resolvedLeadId = lead.id;
    }

    // If this is a reply, mark the inbound email(s) in this thread as "replied"
    if (threadId) {
      await supabase
        .from("emails")
        .update({ status: "replied", updated_at: new Date().toISOString() })
        .eq("thread_id", threadId)
        .eq("direction", "inbound")
        .neq("status", "replied");
    }

    const { data: email, error: insertError } = await supabase
      .from("emails")
      .insert({
        thread_id: finalThreadId,
        direction: "outbound",
        status: "received",
        delivery_status: "sent",
        from_email: fromAddr,
        from_name: fromName,
        to_email: to,
        subject,
        body_html: bodyHtml,
        resend_id: sendResult?.id || null,
        lead_id: resolvedLeadId,
        is_read: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Store sent email error:", insertError);
    }

    return NextResponse.json({ success: true, email, thread_id: finalThreadId });
  } catch (error) {
    console.error("Send email error:", error);
    return apiError("Internal server error", 500);
  }
}
