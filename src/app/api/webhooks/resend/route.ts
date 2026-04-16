import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Webhook } from "svix";
import { classifyAndDraftReply, sendAutoReply } from "@/lib/ai-email";
import DOMPurify from "isomorphic-dompurify";
import crypto from "crypto";

// Sanitize inbound email HTML to prevent stored XSS when admins view emails in the inbox.
// Strips scripts, event handlers, and dangerous tags while preserving layout/formatting.
function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "a", "b", "blockquote", "br", "caption", "cite", "code", "col", "colgroup",
      "dd", "del", "details", "dfn", "div", "dl", "dt", "em", "figcaption", "figure",
      "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img",
      "ins", "kbd", "li", "main", "mark", "menu", "nav", "ol", "p", "pre", "q",
      "rp", "rt", "ruby", "s", "samp", "section", "small", "span", "strong", "sub",
      "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr",
      "u", "ul", "var",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "width", "height", "style",
      "align", "valign", "colspan", "rowspan", "cellpadding", "cellspacing", "border",
      "bgcolor", "color", "target", "rel",
    ],
    ALLOW_DATA_ATTR: false,
    FORCE_BODY: true,
  });
}

/**
 * Resend Webhook — handles inbound emails and delivery status updates.
 * Uses Svix for signature verification, fetches full body from Resend API,
 * runs AI classification via xAI Grok, and triggers auto-reply when safe.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();

    // ── Verify webhook signature with Svix ──
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret) {
      const svixId = req.headers.get("svix-id");
      const svixTimestamp = req.headers.get("svix-timestamp");
      const svixSignature = req.headers.get("svix-signature");

      if (!svixId || !svixTimestamp || !svixSignature) {
        return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
      }

      const wh = new Webhook(webhookSecret);
      try {
        wh.verify(rawBody, {
          "svix-id": svixId,
          "svix-timestamp": svixTimestamp,
          "svix-signature": svixSignature,
        });
      } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);
    const eventType = body.type as string;
    const supabase = createAdminClient();

    // ── Inbound email ──
    if (eventType === "email.received") {
      const data = body.data;
      const resendEmailId = data.email_id || data.id;
      const fromEmail = (data.from?.email || data.from || "").toLowerCase().trim();
      const fromName = data.from?.name || "";
      const toEmail = (Array.isArray(data.to) ? data.to[0] : data.to || "").toLowerCase().trim();
      const subject = data.subject || "(No Subject)";

      if (!fromEmail || !toEmail) {
        console.log("Missing from/to email in webhook payload");
        return NextResponse.json({ error: "Missing from or to email" }, { status: 400 });
      }
      const cc = data.cc || null;
      const replyTo = data.reply_to || null;
      const incomingHeaders = data.headers || {};

      // ── Fetch full email body from Resend API ──
      let bodyHtml = data.html || data.body || "";
      let bodyText = data.text || "";

      if (resendEmailId && (!bodyHtml || bodyHtml.length < 10)) {
        try {
          const resendRes = await fetch(
            `https://api.resend.com/emails/receiving/${resendEmailId}`,
            {
              headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              },
            }
          );
          if (resendRes.ok) {
            const fullEmail = await resendRes.json();
            bodyHtml = fullEmail.html || fullEmail.body || bodyHtml;
            bodyText = fullEmail.text || bodyText;
          }
        } catch (err) {
          console.error("Failed to fetch full email body from Resend:", err);
        }
      }

      const inReplyTo = incomingHeaders["in-reply-to"] || "";
      const references = incomingHeaders["references"] || "";

      // ── Spam filtering ──
      if (isSpam(fromEmail, subject, bodyText || bodyHtml)) {
        console.log(`Spam filtered: from=${fromEmail} subject="${subject}"`);
        return NextResponse.json({ success: true, filtered: "spam" });
      }

      let threadId: string | null = null;
      let leadId: string | null = null;

      // 1. Match thread via In-Reply-To header (most reliable)
      if (inReplyTo) {
        const { data: referencedEmail } = await supabase
          .from("emails")
          .select("thread_id, lead_id")
          .eq("headers->message-id", inReplyTo)
          .limit(1)
          .maybeSingle();

        if (referencedEmail) {
          threadId = referencedEmail.thread_id;
          leadId = referencedEmail.lead_id;
        }
      }

      // 2. Fallback: match by normalized subject + sender
      if (!threadId) {
        const normalizedSubject = normalizeSubject(subject);
        if (normalizedSubject) {
          const { data: subjectMatch } = await supabase
            .from("emails")
            .select("thread_id, lead_id")
            .or(`from_email.eq.${fromEmail},to_email.eq.${fromEmail}`)
            .ilike("subject", `%${normalizedSubject}%`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (subjectMatch) {
            threadId = subjectMatch.thread_id;
            leadId = subjectMatch.lead_id;
          }
        }
      }

      // 3. Fallback: match by sender email alone
      if (!threadId) {
        const { data: priorEmail } = await supabase
          .from("emails")
          .select("thread_id, lead_id")
          .or(`from_email.eq.${fromEmail},to_email.eq.${fromEmail}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (priorEmail) {
          threadId = priorEmail.thread_id;
          leadId = priorEmail.lead_id;
        }
      }

      // 4. New thread
      if (!threadId) {
        threadId = crypto.randomUUID();
      }

      // Try to match sender to a lead
      if (!leadId) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id")
          .eq("user_email", fromEmail)
          .limit(1)
          .maybeSingle();
        if (lead) leadId = lead.id;
      }

      // Sanitize HTML before storing to prevent stored XSS in the admin inbox
      const safeBodyHtml = bodyHtml ? sanitizeEmailHtml(bodyHtml) : "";

      // Insert the inbound email
      const { data: inserted, error: insertError } = await supabase
        .from("emails")
        .insert({
          thread_id: threadId,
          direction: "inbound",
          status: "received",
          resend_message_id: resendEmailId || null,
          from_email: fromEmail,
          from_name: fromName,
          to_email: toEmail,
          subject,
          body_html: safeBodyHtml,
          body_text: bodyText,
          reply_to: replyTo,
          cc,
          lead_id: leadId,
          is_starred: false,
          headers: {
            "message-id": incomingHeaders["message-id"] || null,
            "in-reply-to": inReplyTo || null,
            references: references || null,
          },
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Failed to store inbound email:", insertError);
        return NextResponse.json({ error: "Failed to store email" }, { status: 500 });
      }

      const emailId = inserted.id;

      // ── Async AI classification + auto-reply (non-blocking) ──
      processAIClassification(emailId, fromName, fromEmail, subject, bodyText || bodyHtml, threadId).catch(
        (err) => console.error("AI classification pipeline error:", err)
      );

      return NextResponse.json({ success: true, thread_id: threadId, email_id: emailId });
    }

    // ── Delivery status events ──
    if (
      eventType === "email.delivered" ||
      eventType === "email.bounced" ||
      eventType === "email.complained"
    ) {
      const resendId = body.data?.email_id;
      if (resendId) {
        const statusMap: Record<string, string> = {
          "email.delivered": "delivered",
          "email.bounced": "bounced",
          "email.complained": "failed",
        };
        await supabase
          .from("emails")
          .update({ status: statusMap[eventType] })
          .eq("resend_message_id", resendId);
      }
      return NextResponse.json({ success: true, type: eventType });
    }

    // Acknowledge other events
    return NextResponse.json({ success: true, type: eventType });
  } catch (error) {
    console.error("Resend webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

// ── AI classification pipeline ──

async function processAIClassification(
  emailId: string,
  fromName: string,
  fromEmail: string,
  subject: string,
  bodyText: string,
  threadId: string
) {
  const supabase = createAdminClient();

  const result = await classifyAndDraftReply(fromName, fromEmail, subject, bodyText);

  // Store AI results on the email
  await supabase
    .from("emails")
    .update({
      ai_category: result.category,
      ai_confidence: result.confidence,
      ai_summary: result.summary,
      ai_draft_html: result.draftHtml,
      ai_draft_text: result.draftText,
      ai_processed_at: new Date().toISOString(),
    })
    .eq("id", emailId);

  // Auto-reply if safe
  if (result.autoSendable) {
    const toName = fromName || fromEmail.split("@")[0];
    await sendAutoReply(
      emailId,
      fromEmail,
      toName,
      subject,
      result.draftHtml,
      result.draftText,
      threadId
    );
  }
}

// ── Helpers ──

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSpam(fromEmail: string, subject: string, body: string): boolean {
  const spamTlds = [".xyz", ".top", ".buzz", ".click", ".gdn", ".icu"];
  if (spamTlds.some((tld) => fromEmail.endsWith(tld))) return true;

  const blockedPrefixes = ["noreply@", "no-reply@", "mailer-daemon@", "postmaster@"];
  if (blockedPrefixes.some((p) => fromEmail.startsWith(p))) return true;

  const spamPatterns = [
    /\bcrypto\s*(investment|trading|profit)\b/i,
    /\bunsubscribe\b.*\bclick\s*here\b/i,
    /\b(viagra|cialis|pharmacy)\b/i,
    /\bwin\s+(a\s+)?\$?\d/i,
    /\bcongratulations.*you('ve| have)\s+won\b/i,
    /\bact\s+now\b.*\blimited\s+time\b/i,
    /\bnigerian?\s+prince\b/i,
    /\b(bitcoin|btc|ethereum)\s*(giveaway|doubl)/i,
  ];

  const textToCheck = `${subject} ${body}`.toLowerCase();
  if (spamPatterns.some((p) => p.test(textToCheck))) return true;

  const linkCount = (body.match(/https?:\/\//gi) || []).length;
  const wordCount = body.split(/\s+/).length;
  if (linkCount > 10 && wordCount < 200) return true;

  return false;
}
