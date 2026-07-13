import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { getResendClient, getFromEmail } from "@/lib/resend/client";
import { isValidUUID, escapeHtml } from "@/lib/utils";
import { apiError } from "@/lib/api-helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error || "Unauthorized", auth.status);
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return apiError("Invalid lead ID");
    }

    const body = await req.json();
    const { subject, body: emailBody } = body as { subject: string; body: string };

    if (!subject || !emailBody) {
      return apiError("subject and body required");
    }

    const supabase = createAdminClient();

    // Fetch lead email
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("user_email, name")
      .eq("id", id)
      .single();

    if (leadError || !lead) {
      return apiError("Lead not found", 404);
    }

    if (!lead.user_email) {
      return apiError("Lead has no email address");
    }

    // Send email via Resend
    const resend = getResendClient();
    const { error: sendError } = await resend.emails.send({
      from: getFromEmail(),
      to: [lead.user_email],
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          ${lead.name ? `<p>Hi ${escapeHtml(lead.name)},</p>` : ""}
          <div>${emailBody}</div>
          <p style="margin-top: 24px; color: #666; font-size: 12px;">
            — The Staycio Team
          </p>
        </div>
      `,
    });

    if (sendError) {
      console.error("Send email error:", sendError);
      return apiError("Failed to send email", 500);
    }

    // Log lead event
    await supabase.from("lead_events").insert({
      lead_id: id,
      type: "email_sent",
      payload: { subject, to: lead.user_email },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lead email error:", error);
    return apiError("Internal server error", 500);
  }
}
