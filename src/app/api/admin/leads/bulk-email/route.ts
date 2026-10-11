import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { getResendClient, getFromEmail } from "@/lib/resend/client";
import { isValidUUID, escapeHtml } from "@/lib/utils";
import { getReplyToAddress } from "@/lib/email/recipients";
import { senderIdentityFor } from "@/lib/microsites";
import { apiError } from "@/lib/api-helpers";
import { unsubscribeFooterHtml, unsubscribeToken } from "@/lib/email/unsubscribe";
import { getAdminInboxService } from "@/lib/email/admin-inbox";

// Up to 200 sends; Resend batches of 100 keep this well inside the limit.
export const maxDuration = 60;

// Most microsite leads want the same thing — 43 of the first 60 asked for a
// Q4 2026 move-in at Downtown 6 — so the realistic outreach is one message to
// many people. Sending it one dialog at a time is why the backlog sat untouched.
//
// Each recipient still gets their own send: individually addressed, greeted by
// name, and from the building they actually signed up on. No BCC blast.

const MAX_RECIPIENTS = 200;
const BATCH_SIZE = 100;

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

/**
 * The admin types plain text, and lead names come from public forms. Inserted
 * raw, line breaks collapsed into one paragraph and a name like
 * `<img onerror=…>` ran in the admin preview (rendered as HTML). Escape
 * everything, then keep the line breaks.
 */
function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

/** "Hi Jordan," above every message; the preview shows it too. */
function greetingHtml(lead: Lead): string {
  const first = (lead.name ?? "").trim().split(/\s+/)[0];
  return first ? `<p>Hi ${escapeHtml(first)},</p>` : "";
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
      .select("id, name, user_email, source_detail, unsubscribed_at")
      .in("id", lead_ids);

    if (error) {
      console.error("Bulk email lead fetch failed:", error);
      return apiError("Failed to load leads", 500);
    }

    const fallbackFrom = getFromEmail();
    // CAN-SPAM: never mail someone who used the unsubscribe link, on any of
    // their lead rows.
    const optedOut = new Set(
      (leads ?? []).filter((l) => l.unsubscribed_at).map((l) => l.user_email?.trim().toLowerCase())
    );
    // One send per address: the same person often has several lead rows.
    // Every selected row of theirs is kept for pulling back queued notes.
    const byEmail = new Map<string, Lead>();
    const idsByEmail = new Map<string, string[]>();
    for (const lead of leads ?? []) {
      const email = lead.user_email?.trim().toLowerCase();
      if (!email || optedOut.has(email)) continue;
      if (!byEmail.has(email)) byEmail.set(email, { id: lead.id, name: lead.name, user_email: email, source_detail: lead.source_detail });
      idsByEmail.set(email, [...(idsByEmail.get(email) ?? []), lead.id]);
    }
    const withEmail = [...byEmail.values()];
    // Unsubscribed, duplicate or address-less rows
    const skipped = lead_ids.length - withEmail.length;

    // Bulk mail must carry a working unsubscribe link (signed with CRON_SECRET).
    if (withEmail.length > 0 && !unsubscribeToken(withEmail[0].id)) {
      return apiError("Email sending is not configured (missing unsubscribe signing secret)", 500);
    }

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
              body:
                greetingHtml(sample) +
                `<div>${textToHtml(fill(emailBody, sample, senderIdentityFor(sample.source_detail, fallbackFrom).label))}</div>`,
            }
          : null,
      });
    }

    const resend = getResendClient();
    const inbox = getAdminInboxService();
    const replyTo = getReplyToAddress();
    const sent: string[] = [];
    const failed: { id: string; error: string }[] = [];
    let notesNotCancelled = 0;

    const render = (lead: Lead) => {
      const sender = senderIdentityFor(lead.source_detail, fallbackFrom);
      return {
        from: sender.from,
        to: [lead.user_email!],
        ...(replyTo ? { replyTo } : {}),
        subject: fill(subject, lead, sender.label),
        html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          ${greetingHtml(lead)}
          <div>${textToHtml(fill(emailBody, lead, sender.label))}</div>
          <p style="margin-top: 24px; color: #666; font-size: 12px;">
            — ${escapeHtml(sender.label)}${sender.label === "Staycio" ? "" : " · via Staycio"}
          </p>
          ${unsubscribeFooterHtml(lead.id)}
        </div>`,
      };
    };

    // Batches instead of 200 sequential sends (which could hit Resend's rate
    // limit or the function timeout part-way). Each batch is recorded as soon
    // as it goes out, so a retry after a failure can't re-mail those leads
    // without the events showing it.
    for (let i = 0; i < withEmail.length; i += BATCH_SIZE) {
      const chunk = withEmail.slice(i, i + BATCH_SIZE);
      let batchError: { message?: string } | null = null;
      try {
        ({ error: batchError } = await resend.batch.send(chunk.map(render)));
      } catch (err) {
        batchError = { message: err instanceof Error ? err.message : "send failed" };
      }
      if (batchError) {
        for (const lead of chunk) failed.push({ id: lead.id, error: batchError.message ?? "send failed" });
        continue;
      }
      const ids = chunk.map((l) => l.id);
      sent.push(...ids);
      // The automatic note still queued for someone who just got this one
      // would arrive after it and read as a bot: pull back any queued for
      // the selected leads of everyone in this batch.
      try {
        notesNotCancelled += (await inbox.cancelScheduledForLeads(chunk.flatMap((l) => idsByEmail.get(l.user_email!) ?? [l.id]))).failed;
      } catch (err) {
        console.error("Bulk email: could not cancel queued notes:", err);
        notesNotCancelled += chunk.length;
      }
      await supabase.from("lead_events").insert(
        ids.map((lead_id) => ({ lead_id, type: "email_sent", payload: { subject, bulk: true } }))
      );
      if (mark_contacted) {
        await supabase.from("leads").update({ status: "contacted" }).in("id", ids).eq("status", "new");
        // Worked leads leave the inbox's Unread, and so do the same people's
        // duplicate signups for the same building.
        await inbox.markLeadAlertsRead(ids).catch((err) => console.error("Bulk email: could not clear lead alerts:", err));
        await inbox
          .advanceDuplicateSignups(ids, "contacted")
          .catch((err) => console.error("Bulk email: could not update duplicate signups:", err));
      }
    }

    return NextResponse.json({
      sent: sent.length,
      failed: failed.length,
      skipped_no_email: skipped,
      notes_not_cancelled: notesNotCancelled,
      errors: failed.slice(0, 5),
    });
  } catch (err) {
    console.error("Bulk email error:", err);
    return apiError("Internal server error", 500);
  }
}
