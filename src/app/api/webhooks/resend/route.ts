import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import crypto from "crypto";

/**
 * Resend Webhook — handles both inbound emails and delivery status updates.
 * Configure in Resend dashboard: https://yourdomain.com/api/webhooks/resend
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // Verify webhook signature if configured
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers.get("svix-signature");
      const timestamp = req.headers.get("svix-timestamp");
      const svixId = req.headers.get("svix-id");

      if (!signature || !timestamp || !svixId) {
        return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
      }

      const toSign = `${svixId}.${timestamp}.${rawBody}`;
      const secret = webhookSecret.startsWith("whsec_")
        ? Buffer.from(webhookSecret.slice(6), "base64")
        : Buffer.from(webhookSecret);
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(toSign)
        .digest("base64");

      const signatures = signature.split(" ").map((s) => s.replace("v1,", ""));
      const isValid = signatures.some((s) => {
        try {
          return crypto.timingSafeEqual(
            Buffer.from(s, "base64"),
            Buffer.from(expectedSignature, "base64")
          );
        } catch {
          return false;
        }
      });

      if (!isValid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const eventType = body.type as string;
    const supabase = createAdminClient();

    // ── Inbound email ──
    if (eventType === "email.received") {
      const data = body.data;
      const fromEmail = (data.from?.email || data.from || "").toLowerCase().trim();
      const fromName = data.from?.name || "";
      const toEmail = (Array.isArray(data.to) ? data.to[0] : data.to || "").toLowerCase().trim();
      const subject = data.subject || "(No Subject)";
      const bodyHtml = data.html || data.body || "";
      const bodyText = data.text || "";
      const headers = data.headers || {};

      const inReplyTo = headers["in-reply-to"] || "";
      const references = headers["references"] || "";

      // ── Spam filtering ──
      if (isSpam(fromEmail, subject, bodyText || bodyHtml)) {
        console.log(`Spam filtered: from=${fromEmail} subject="${subject}"`);
        return NextResponse.json({ success: true, filtered: "spam" });
      }

      let threadId: string | null = null;
      let leadId: string | null = null;

      // 1. Try to match thread using In-Reply-To / References headers (most reliable)
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

      // 2. Fallback: match by normalized subject line (strip Re:/Fwd: prefixes)
      if (!threadId) {
        const normalizedSubject = normalizeSubject(subject);
        if (normalizedSubject) {
          const { data: subjectMatch } = await supabase
            .from("emails")
            .select("thread_id, lead_id")
            .or(`from_email.eq."${fromEmail}",to_email.eq."${fromEmail}"`)
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

      // 3. Fallback: match by sender email address alone
      if (!threadId) {
        const { data: priorEmail } = await supabase
          .from("emails")
          .select("thread_id, lead_id")
          .or(`from_email.eq."${fromEmail}",to_email.eq."${fromEmail}"`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (priorEmail) {
          threadId = priorEmail.thread_id;
          leadId = priorEmail.lead_id;
        }
      }

      // 4. No match — new thread
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

      // Mark outbound emails in this thread as "replied"
      if (threadId) {
        await supabase
          .from("emails")
          .update({ status: "replied", updated_at: new Date().toISOString() })
          .eq("thread_id", threadId)
          .eq("direction", "outbound")
          .neq("status", "replied");
      }

      const { error: insertError } = await supabase.from("emails").insert({
        thread_id: threadId,
        direction: "inbound",
        status: "received",
        delivery_status: null,
        from_email: fromEmail,
        from_name: fromName,
        to_email: toEmail,
        subject,
        body_html: bodyHtml,
        body_text: bodyText,
        lead_id: leadId,
        is_read: false,
        headers: {
          "message-id": headers["message-id"] || null,
          "in-reply-to": inReplyTo || null,
          references: references || null,
        },
      });

      if (insertError) {
        console.error("Failed to store inbound email:", insertError);
        return NextResponse.json({ error: "Failed to store email" }, { status: 500 });
      }

      return NextResponse.json({ success: true, thread_id: threadId });
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
          "email.complained": "complained",
        };
        await supabase
          .from("emails")
          .update({
            delivery_status: statusMap[eventType],
            updated_at: new Date().toISOString(),
          })
          .eq("resend_id", resendId);
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

// ── Helpers ──

/** Strip Re:/Fwd:/FW: prefixes and normalize whitespace for subject matching */
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Basic spam filtering — returns true if the email looks like spam */
function isSpam(fromEmail: string, subject: string, body: string): boolean {
  // Block known spam TLDs
  const spamTlds = [".xyz", ".top", ".buzz", ".click", ".gdn", ".icu"];
  if (spamTlds.some((tld) => fromEmail.endsWith(tld))) return true;

  // Block noreply / mailer-daemon
  const blockedPrefixes = ["noreply@", "no-reply@", "mailer-daemon@", "postmaster@"];
  if (blockedPrefixes.some((p) => fromEmail.startsWith(p))) return true;

  // Spam keyword patterns in subject or body
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

  // Reject if body contains excessive links (>10 links in a short email)
  const linkCount = (body.match(/https?:\/\//gi) || []).length;
  const wordCount = body.split(/\s+/).length;
  if (linkCount > 10 && wordCount < 200) return true;

  return false;
}
