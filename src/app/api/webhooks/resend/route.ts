import { NextResponse, after } from "next/server";
import { Webhook } from "svix";
import { getAdminInboxService } from "@/lib/email/admin-inbox";
import { getResendClient } from "@/lib/resend/client";
import { classifyAndDraftReply, sendAutoReply } from "@/lib/ai-email";
import { sendInboxAlert } from "@/lib/email/inbox-notify";
import { extractPhone, stripQuotedHistory } from "@/lib/email/phone-capture";
import {
  findOurRecipient,
  getAdminFromAddress,
  parseEmailAddress,
  parseThreadIdFromAddresses,
  senderDisplayName,
} from "@/lib/email/inbound-address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resend webhook for the admin inbox.
 *
 * Inbound: Resend receives mail for ANY address on a receiving domain and
 * POSTs `email.received`. That event carries METADATA ONLY — ids, bare from,
 * to[], subject, attachment names. The body and the headers must be fetched
 * from GET /emails/receiving/{email_id}. Replies to mail we sent arrive at
 * replies+<threadId>@inbound.staycio.com (see inbound-address.ts), which
 * threads them exactly.
 *
 * Resend webhooks are account-wide: receiving domains of OTHER projects on
 * the same account (Digis, EXA, Mayells, Cannes Swim Week) fire here too.
 * Only mail with a recipient on our domains is stored; the rest is
 * acknowledged and dropped before the (paid, rate-limited) body fetch.
 *
 * Delivery: `email.delivered` / `email.bounced` / `email.failed` /
 * `email.complained` update the status of the outbound row with that Resend
 * email id.
 *
 * Ops: the endpoint registered in Resend must be the apex
 * https://staycio.com host. www 308s to the apex, and Svix treats every 3xx
 * as a failed delivery.
 */

type ReceivedEmail = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getResendClient>["emails"]["receiving"]["get"]>>["data"]
>;

function lowercaseKeys(h: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h || {})) {
    if (v == null) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(" ") : String(v);
  }
  return out;
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && !!v);
  return typeof value === "string" && value ? [value] : [];
}

export async function POST(request: Request) {
  try {
    // Everything downstream trusts the sender field (admin inbox, LLM
    // classification, auto-replies from hello@staycio.com), so an unverified
    // payload is an email-spoofing + outbound-spam vector. Fail closed.
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[Resend Inbound] RESEND_WEBHOOK_SECRET is not set — rejecting");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }

    // Signature is over the raw body — read text first, parse after verify.
    const rawBody = await request.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
      // svix verifies signature + timestamp tolerance (replay window) together.
      body = new Webhook(webhookSecret).verify(rawBody, {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      });
    } catch {
      console.warn("[Resend Inbound] Invalid webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const eventType: string = body?.type;
    const inbox = getAdminInboxService();

    if (eventType === "email.received") {
      const data = body.data ?? {};
      const emailId: string | undefined = data.email_id || data.id;

      // Cheap pre-filter on the event's own recipients: mail for another
      // project's domain never needs the fetch.
      const eventRecipients = [...toList(data.received_for), ...toList(data.to), ...toList(data.cc), ...toList(data.bcc)];
      if (eventRecipients.length > 0 && !findOurRecipient(eventRecipients)) {
        return NextResponse.json({ received: true, ignored: "not our domain" });
      }

      // The webhook has no body/headers. Fetch the full message; without it
      // there is nothing to read or classify, so a fetch failure is returned
      // as 5xx so Svix retries (dedup in the service makes retries safe).
      let full: ReceivedEmail | null = null;
      if (emailId && process.env.RESEND_API_KEY) {
        const { data: fetched, error } = await getResendClient().emails.receiving.get(emailId);
        if (error || !fetched) {
          console.error(`[Resend Inbound] Failed to fetch received email ${emailId}:`, error?.message);
          return NextResponse.json({ error: "Failed to fetch email content" }, { status: 502 });
        }
        full = fetched;
      } else if (!process.env.RESEND_API_KEY) {
        console.warn("[Resend Inbound] RESEND_API_KEY missing — storing webhook metadata only");
      }

      const recipients: string[] = [
        ...toList(data.received_for),
        ...toList(full?.received_for),
        ...toList(full?.to ?? data.to),
        ...toList(full?.cc ?? data.cc),
        ...toList(full?.bcc ?? data.bcc),
      ];
      const to = findOurRecipient(recipients);
      if (!to) {
        return NextResponse.json({ received: true, ignored: "not our domain" });
      }

      const headers = lowercaseKeys(full?.headers);
      const rawFrom: string = full?.from ?? (typeof data.from === "string" ? data.from : data.from?.email ?? "");
      const { email: from } = parseEmailAddress(rawFrom);
      // Resend's `from` is the bare address; the display name only survives
      // in the raw From header.
      const fromName = senderDisplayName(headers["from"], rawFrom) ?? (typeof data.from?.name === "string" ? data.from.name : null);
      const subject: string = full?.subject || data.subject || "(No Subject)";
      const messageId: string = headers["message-id"] || full?.message_id || data.message_id || "";
      const inReplyTo = headers["in-reply-to"] || "";
      const references = headers["references"] || "";
      const threadIdHint = parseThreadIdFromAddresses(recipients);
      const replyTo = toList(full?.reply_to ?? data.reply_to).map((r) => parseEmailAddress(r).email)[0] ?? null;
      const attachments = (
        (full?.attachments ?? data.attachments ?? []) as Array<{
          id: string;
          filename?: string | null;
          content_type?: string;
          size?: number;
        }>
      ).map((a) => ({ id: a.id, filename: a.filename || "attachment", contentType: a.content_type || "", size: a.size }));

      if (!from) {
        console.warn(`[Resend Inbound] Ignoring email ${emailId} with no sender`);
        return NextResponse.json({ received: true, ignored: "no sender" });
      }

      console.log(`[Resend Inbound] Email received from ${from} for ${to}: ${subject}`);

      const stored = await inbox.storeInboundEmail({
        from,
        fromName,
        to,
        subject,
        text: full?.text || "",
        html: full?.html || "",
        messageId,
        inReplyToHeader: inReplyTo || undefined,
        referencesHeader: references || undefined,
        threadIdHint,
        resendEmailId: emailId,
        replyTo,
        cc: toList(full?.cc ?? data.cc).map((c) => parseEmailAddress(c).email),
        attachments,
      });

      // AI classification, the (optional) auto-reply and the owner's phone
      // alert run after the 200 is sent. after() keeps the serverless function
      // alive until they finish — a bare floating promise gets frozen once
      // the response returns.
      if (stored && stored.is_spam !== true) {
        const text = full?.text || "";
        const html = full?.html || "";
        after(async () => {
          let summary: string | null = null;
          let autoReplied = false;
          if (process.env.XAI_API_KEY) {
            try {
              const result = await classifyAndDraftReply({ from, fromName, subject, text, html });
              summary = result.summary || null;
              await inbox.updateAiFields(stored.id, {
                aiCategory: result.category,
                aiConfidence: result.confidence,
                aiSummary: result.summary,
                aiDraftText: result.draftText,
                aiDraftHtml: result.draftHtml,
              });
              const auto = await sendAutoReply(stored.id, result, {
                from,
                fromName,
                subject,
                threadId: stored.thread_id ?? stored.id,
                messageId: stored.headers?.["message-id"] ?? (messageId || null),
                leadId: stored.lead_id,
                headers,
              });
              autoReplied = auto.sent;
              if (!auto.sent) console.log(`[AI Email] No auto-reply for ${stored.id}: ${auto.reason}`);
            } catch (err) {
              console.error("[AI Email] Classification failed:", err);
            }
          }

          // Tell the owner. Runs last so the alert can say what Stacy made of
          // the message and whether she already answered it; it still goes
          // out when the AI is off or failed.
          // A lead who answers the "what's your phone number?" follow-up gets
          // that number on their lead, so the team can text or call. Never
          // overwrites a number from the form.
          let phoneSaved: string | null = null;
          if (stored.lead_id) {
            try {
              phoneSaved = await inbox.captureLeadPhone(stored.lead_id, extractPhone(stripQuotedHistory(text, html)));
              if (phoneSaved) console.log(`[Inbox] Saved phone from email reply to lead ${stored.lead_id}`);
            } catch (err) {
              console.error("[Inbox] Phone capture failed:", err);
            }
          }

          try {
            const sender = await inbox.senderForLead(stored.lead_id).catch(() => null);
            const alert = await sendInboxAlert({
              id: stored.id,
              from,
              fromName,
              to,
              subject,
              text,
              html,
              summary,
              autoReplied,
              // Only a microsite lead has a building; everyone else is "Staycio".
              building: sender && sender.email !== getAdminFromAddress() ? sender.name : null,
              phoneSaved,
              headers,
            });
            if (!alert.sent) console.log(`[Inbox Alert] Not sent for ${stored.id}: ${alert.reason}`);
          } catch (err) {
            console.error("[Inbox Alert] Failed:", err);
          }
        });
      }

      return NextResponse.json({ received: true, stored: !!stored });
    }

    // Delivery status events for mail we sent. Other projects' sends on the
    // same account arrive here too; the update is keyed by Resend id + our
    // outbound direction, so they match nothing.
    if (
      eventType === "email.delivered" ||
      eventType === "email.bounced" ||
      eventType === "email.failed" ||
      eventType === "email.complained"
    ) {
      const id: string | undefined = body.data?.email_id;
      if (id) {
        const status = eventType === "email.delivered" ? "delivered" : eventType === "email.bounced" ? "bounced" : "failed";
        await inbox.updateDeliveryStatus(id, status);
      }
      return NextResponse.json({ received: true });
    }

    // For other event types, just acknowledge.
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Resend Inbound] Webhook error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
