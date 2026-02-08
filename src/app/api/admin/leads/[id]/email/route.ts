import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { getResendClient, getFromEmail } from "@/lib/resend/client";
import { isValidUUID, escapeHtml } from "@/lib/utils";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
    }

    const body = await req.json();
    const { subject, body: emailBody } = body as { subject: string; body: string };

    if (!subject || !emailBody) {
      return NextResponse.json({ error: "subject and body required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch lead email
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("user_email, name")
      .eq("id", id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (!lead.user_email) {
      return NextResponse.json({ error: "Lead has no email address" }, { status: 400 });
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
            — The LuxApts Team
          </p>
        </div>
      `,
    });

    if (sendError) {
      console.error("Send email error:", sendError);
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
