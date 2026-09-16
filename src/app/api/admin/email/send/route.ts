import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { logAuditEvent, AuditAction } from "@/lib/admin/audit";
import { getResendClient, getFromEmail } from "@/lib/resend/client";
import { apiError } from "@/lib/api-helpers";
import { fetchAllRows } from "@/lib/db-helpers";
import { escapeHtml } from "@/lib/utils";
import { getReplyToAddress } from "@/lib/email/recipients";
import { unsubscribeFooterHtml, unsubscribeToken } from "@/lib/email/unsubscribe";

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

    // Query matching leads with emails. Paged — the unpaged version silently
    // stopped at PostgREST's 1000-row cap, so large campaigns only ever
    // reached the first 1000 leads while reporting success for all of them.
    // Unsubscribed leads are excluded (CAN-SPAM).
    // `unsubscribed_at` arrives with migration 024. If the code is deployed
    // before the migration is applied, PostgREST answers 42703 for the whole
    // query; refusing to send is safer than mailing everyone, so the
    // unfiltered retry is only taken when the column genuinely does not exist.
    const selectLeads = (withUnsubscribeFilter: boolean) =>
      fetchAllRows<{ id: string; user_email: string | null; name: string | null }>((from, to) => {
        let query = supabase
          .from("leads")
          .select("id, user_email, name")
          .not("user_email", "is", null);

        if (withUnsubscribeFilter) {
          query = query.is("unsubscribed_at", null);
        }
        if (filter?.status) {
          query = query.eq("status", filter.status);
        }
        if (filter?.source) {
          query = query.eq("source", filter.source);
        }
        if (filter?.city_id) {
          query = query.eq("city_id", filter.city_id);
        }

        return query.order("id").range(from, to);
      });

    // fetchAllRows swallows query errors (it stops paging and returns what it
    // has), so probe for the column first rather than silently mailing nobody.
    const probe = await supabase
      .from("leads")
      .select("id")
      .is("unsubscribed_at", null)
      .limit(1);
    const hasUnsubscribeColumn = probe.error?.code !== "42703";
    if (!hasUnsubscribeColumn) {
      console.error(
        "leads.unsubscribed_at is missing — apply migration 024; sending without the opt-out filter"
      );
    }

    const leads = await selectLeads(hasUnsubscribeColumn);

    // One send per address: the same person often has several lead rows
    // (one per enquiry), which meant duplicate copies of every campaign.
    const byEmail = new Map<string, { id: string; user_email: string; name: string | null }>();
    for (const lead of leads) {
      const email = lead.user_email?.trim().toLowerCase();
      if (!email) continue;
      if (!byEmail.has(email)) {
        byEmail.set(email, { id: lead.id, user_email: email, name: lead.name });
      }
    }
    const recipients = [...byEmail.values()];

    if (recipients.length === 0) {
      return apiError("No recipients match the filter");
    }

    // CAN-SPAM: bulk mail must carry a working unsubscribe link, which is
    // signed with CRON_SECRET. Refuse to send rather than mail without one.
    if (!unsubscribeToken(recipients[0].id)) {
      console.error("Campaign send blocked: CRON_SECRET is not configured (no unsubscribe link)");
      return apiError("Email sending is not configured (missing unsubscribe signing secret)", 500);
    }

    // Create the campaign record upfront so we can update delivery counts on it
    const { data: campaign, error: insertError } = await supabase
      .from("email_campaigns")
      .insert({
        subject,
        body_html,
        recipient_filter: filter || {},
        recipients_count: recipients.length,
        sent_count: 0,
        failed_count: 0,
        status: "sending",
        created_by: auth.userId,
      })
      .select("id")
      .single();

    if (insertError || !campaign) {
      console.error("Insert campaign error:", insertError);
      return apiError("Failed to create campaign record", 500);
    }

    // Send via Resend batch (chunks of 100), tracking delivery counts.
    // Resend v6 reports API failures through the returned `error` and does NOT
    // throw, so the old try/catch counted every rejected batch as delivered.
    const resend = getResendClient();
    const fromEmail = getFromEmail();
    const replyTo = getReplyToAddress();
    const CHUNK_SIZE = 100;
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
      const chunk = recipients.slice(i, i + CHUNK_SIZE);
      const emails = chunk.map((lead) => ({
        from: fromEmail,
        to: [lead.user_email],
        ...(replyTo ? { replyTo } : {}),
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            ${lead.name ? `<p>Hi ${escapeHtml(lead.name)},</p>` : ""}
            <div>${body_html}</div>
            <p style="margin-top: 24px; color: #666; font-size: 12px;">
              — The Staycio Team
            </p>
            ${unsubscribeFooterHtml(lead.id)}
          </div>
        `,
      }));

      try {
        const { error: batchError } = await resend.batch.send(emails);
        if (batchError) {
          console.error(`Batch send error (chunk ${i}):`, batchError);
          failedCount += chunk.length;
        } else {
          sentCount += chunk.length;
        }
      } catch (batchError) {
        console.error(`Batch send threw (chunk ${i}):`, batchError);
        failedCount += chunk.length;
      }
    }

    // Update campaign with final delivery counts
    const finalStatus =
      failedCount === 0
        ? "completed"
        : sentCount === 0
          ? "failed"
          : "partial_failure";

    await supabase
      .from("email_campaigns")
      .update({ sent_count: sentCount, failed_count: failedCount, status: finalStatus })
      .eq("id", campaign.id);

    await logAuditEvent(auth.userId, AuditAction.EMAIL_CAMPAIGN_SEND, "email_campaign", campaign.id, {
      subject,
      recipients_count: recipients.length,
      sent_count: sentCount,
      failed_count: failedCount,
      status: finalStatus,
      filter: filter || {},
    });

    return NextResponse.json({
      campaign_id: campaign.id,
      recipients_count: recipients.length,
      sent_count: sentCount,
      failed_count: failedCount,
      status: finalStatus,
    });
  } catch (error) {
    console.error("Send campaign error:", error);
    return apiError("Internal server error", 500);
  }
}
