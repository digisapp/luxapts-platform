import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { getResendClient, getFromEmail } from "@/lib/resend/client";
import { apiError } from "@/lib/api-helpers";

export async function POST(req: Request) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error || "Unauthorized", auth.status);
    }

    const body = await req.json();
    const { subject, body_html, filter } = body as {
      subject: string;
      body_html: string;
      filter?: { status?: string; source?: string; city_id?: string };
    };

    if (!subject || !body_html) {
      return apiError("subject and body_html required");
    }

    const supabase = createAdminClient();

    // Query matching leads with emails
    let query = supabase
      .from("leads")
      .select("id, user_email, name")
      .not("user_email", "is", null);

    if (filter?.status) {
      query = query.eq("status", filter.status);
    }
    if (filter?.source) {
      query = query.eq("source", filter.source);
    }
    if (filter?.city_id) {
      query = query.eq("city_id", filter.city_id);
    }

    const { data: leads, error: leadsError } = await query;

    if (leadsError) {
      console.error("Query leads error:", leadsError);
      return apiError("Failed to query leads", 500);
    }

    const recipients = (leads || []).filter((l) => l.user_email);
    if (recipients.length === 0) {
      return apiError("No recipients match the filter");
    }

    // Send via Resend batch (chunks of 100)
    const resend = getResendClient();
    const fromEmail = getFromEmail();
    const CHUNK_SIZE = 100;

    for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
      const chunk = recipients.slice(i, i + CHUNK_SIZE);
      const emails = chunk.map((lead) => ({
        from: fromEmail,
        to: [lead.user_email!],
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            ${lead.name ? `<p>Hi ${lead.name},</p>` : ""}
            <div>${body_html}</div>
            <p style="margin-top: 24px; color: #666; font-size: 12px;">
              — The LuxApts Team
            </p>
          </div>
        `,
      }));

      try {
        await resend.batch.send(emails);
      } catch (batchError) {
        console.error(`Batch send error (chunk ${i}):`, batchError);
      }
    }

    // Record campaign
    const { data: campaign, error: insertError } = await supabase
      .from("email_campaigns")
      .insert({
        subject,
        body_html,
        recipient_filter: filter || {},
        recipients_count: recipients.length,
        created_by: auth.userId,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert campaign error:", insertError);
    }

    return NextResponse.json({
      campaign_id: campaign?.id || null,
      recipients_count: recipients.length,
    });
  } catch (error) {
    console.error("Send campaign error:", error);
    return apiError("Internal server error", 500);
  }
}
