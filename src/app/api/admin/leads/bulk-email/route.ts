import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { getResendClient, getFromEmail } from "@/lib/resend/client";
import { isValidUUID, escapeHtml } from "@/lib/utils";
import { getReplyToAddress } from "@/lib/email/recipients";
import { senderIdentityFor } from "@/lib/microsites";
import { apiError } from "@/lib/api-helpers";

// Most microsite leads want the same thing — 43 of the first 60 asked for a
// Q4 2026 move-in at Downtown 6 — so the realistic outreach is one message to
// many people. Sending it one dialog at a time is why the backlog sat untouched.
//
// Each recipient still gets their own send: individually addressed, greeted by
// name, and from the building they actually signed up on. No BCC blast.

const MAX_RECIPIENTS = 200;

type Lead = {
  id: string;
  name: string | null;
  user_email: string | null;
  source_detail: string | null;
};

/** {{name}} / {{building}} so one draft can greet everyone properly. */
function fill(template: string, lead: Lead, building: string): string {
  const first = (lead.name ?? "").trim().split(/\s+/)[0] || "there";
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, first)
    .replace(/\{\{\s*building\s*\}\}/gi, building);
}

export async function POST(req: Request) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error || "Unauthorized", auth.status);

    const body = await req.json();
    const {
      lead_ids,
      subject,
      body: emailBody,
      dry_run = false,
      mark_contacted = true,
    } = body as {
      lead_ids: string[];
      subject: string;
      body: string;
      dry_run?: boolean;
      mark_contacted?: boolean;
    };

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) return apiError("lead_ids required");
    if (lead_ids.length > MAX_RECIPIENTS) return apiError(`At most ${MAX_RECIPIENTS} recipients per send`);
    if (!lead_ids.every(isValidUUID)) return apiError("Invalid lead_id format");
    if (!subject?.trim() || !emailBody?.trim()) return apiError("subject and body required");

    const supabase = createAdminClient();
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, name, user_email, source_detail")
      .in("id", lead_ids);

    if (error) {
      console.error("Bulk email lead fetch failed:", error);
      return apiError("Failed to load leads", 500);
    }

    const fallbackFrom = getFromEmail();
    const withEmail = (leads ?? []).filter((l): l is Lead => Boolean(l.user_email));
    const skipped = (leads ?? []).length - withEmail.length;

    // A preview lets the sender see exactly who gets what before anything goes
    // out — the send itself is not undoable.
    if (dry_run) {
      const bySender = new Map<string, number>();
      for (const l of withEmail) {
        const s = senderIdentityFor(l.source_detail, fallbackFrom);
        bySender.set(s.from, (bySender.get(s.from) ?? 0) + 1);
      }
      const sample = withEmail[0];
      return NextResponse.json({
        dry_run: true,
        recipients: withEmail.length,
        skipped_no_email: skipped,
        senders: [...bySender.entries()].map(([from, count]) => ({ from, count })),
        sample: sample
          ? {
              to: sample.user_email,
              from: senderIdentityFor(sample.source_detail, fallbackFrom).from,
              subject: fill(subject, sample, senderIdentityFor(sample.source_detail, fallbackFrom).label),
              body: fill(emailBody, sample, senderIdentityFor(sample.source_detail, fallbackFrom).label),
            }
          : null,
      });
    }

    const resend = getResendClient();
    const replyTo = getReplyToAddress();
    const sent: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const lead of withEmail) {
      const sender = senderIdentityFor(lead.source_detail, fallbackFrom);
      const subj = fill(subject, lead, sender.label);
      const text = fill(emailBody, lead, sender.label);
      const first = (lead.name ?? "").trim().split(/\s+/)[0];

      const { error: sendError } = await resend.emails.send({
        from: sender.from,
        to: [lead.user_email!],
        replyTo,
        subject: subj,
        html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          ${first ? `<p>Hi ${escapeHtml(first)},</p>` : ""}
          <div>${text}</div>
          <p style="margin-top: 24px; color: #666; font-size: 12px;">
            — ${escapeHtml(sender.label)}${sender.label === "Staycio" ? "" : " · via Staycio"}
          </p>
        </div>`,
      });

      if (sendError) {
        // One bad address must not strand the rest of the batch.
        failed.push({ id: lead.id, error: sendError.message ?? "send failed" });
        continue;
      }
      sent.push(lead.id);
    }

    if (sent.length) {
      await supabase.from("lead_events").insert(
        sent.map((lead_id) => ({
          lead_id,
          type: "email_sent",
          payload: { subject, bulk: true },
        }))
      );
      if (mark_contacted) {
        await supabase.from("leads").update({ status: "contacted" }).in("id", sent).eq("status", "new");
      }
    }

    return NextResponse.json({
      sent: sent.length,
      failed: failed.length,
      skipped_no_email: skipped,
      errors: failed.slice(0, 5),
    });
  } catch (err) {
    console.error("Bulk email error:", err);
    return apiError("Internal server error", 500);
  }
}
