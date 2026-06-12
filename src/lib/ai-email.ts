import OpenAI from "openai";
import DOMPurify from "isomorphic-dompurify";
import { getResendClient, getFromEmail } from "@/lib/resend/client";
import { createAdminClient } from "@/lib/supabase/server";
import { escapeHtml } from "@/lib/utils";

/**
 * Sanitize AI-drafted reply HTML before sending. The draft is influenced by
 * attacker-controlled inbound email content (prompt injection), so only a
 * minimal formatting allowlist is permitted — no scripts, styles, images,
 * or non-https/mailto links.
 */
function sanitizeDraftHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "b", "i", "ul", "ol", "li", "a"],
    ALLOWED_ATTR: ["href"],
    ALLOWED_URI_REGEXP: /^(?:https:|mailto:)/i,
  });
}

const CATEGORIES = [
  "tour_request",
  "lease_inquiry",
  "pricing_inquiry",
  "application_status",
  "move_in_question",
  "maintenance_request",
  "amenity_question",
  "scheduling",
  "general_inquiry",
  "feedback",
  "partnership",
  "support",
  "personal",
  "spam",
  "other",
] as const;

type EmailCategory = (typeof CATEGORIES)[number];

// Categories safe for auto-reply (high-volume, standard responses)
const AUTO_SEND_CATEGORIES: EmailCategory[] = [
  "tour_request",
  "lease_inquiry",
  "pricing_inquiry",
  "application_status",
  "move_in_question",
  "amenity_question",
  "scheduling",
  "general_inquiry",
];

const AUTO_SEND_CONFIDENCE_THRESHOLD = 0.85;

export interface EmailClassification {
  category: EmailCategory;
  confidence: number;
  summary: string;
  draftHtml: string;
  draftText: string;
  autoSendable: boolean;
}

function getXaiClient() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not configured");
  return new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });
}

/**
 * Classify an inbound email and draft a reply using xAI Grok.
 */
export async function classifyAndDraftReply(
  fromName: string,
  fromEmail: string,
  subject: string,
  bodyText: string
): Promise<EmailClassification> {
  const xai = getXaiClient();

  const systemPrompt = `You are the AI email assistant for LuxApts, a luxury apartment rental platform.
You classify inbound emails and draft professional replies.

CATEGORIES (pick exactly one):
- tour_request: Wants to schedule or ask about touring an apartment
- lease_inquiry: Questions about leasing terms, availability, move-in dates
- pricing_inquiry: Asking about rent, fees, deposits, pricing
- application_status: Checking on their rental application status
- move_in_question: Questions about the move-in process, requirements, timelines
- maintenance_request: Reporting an issue or requesting maintenance/repair
- amenity_question: Questions about building amenities, features, neighborhood
- scheduling: Scheduling meetings, calls, or follow-ups
- general_inquiry: General questions that don't fit other categories
- feedback: Compliments, complaints, suggestions about service
- partnership: Business proposals, brokerage partnerships, vendor outreach
- support: Account issues, technical problems, billing questions
- personal: Personal messages to specific staff members
- spam: Unsolicited marketing, scams, irrelevant bulk email
- other: Doesn't fit any category

RESPONSE FORMAT (JSON only, no markdown):
{
  "category": "category_name",
  "confidence": 0.95,
  "summary": "One sentence summary for the admin dashboard",
  "draftHtml": "<p>Professional HTML reply</p>",
  "draftText": "Plain text version of the reply"
}

RULES:
- Be warm, professional, and helpful in replies
- For tour requests, confirm we'll reach out within 24 hours
- For lease inquiries, acknowledge and say an agent will follow up with details
- For pricing, say we'll send current availability and pricing
- For spam, set confidence to 1.0 and draft an empty reply
- Address the sender by first name if available
- Keep replies concise (2-4 sentences)
- Never make up specific pricing, availability, or unit details`;

  const userPrompt = `From: ${fromName} <${fromEmail}>
Subject: ${subject}

${bodyText.slice(0, 3000)}`;

  try {
    const response = await xai.chat.completions.create({
      model: "grok-3-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content || "";
    // Strip markdown code fences if present
    const cleaned = content.replace(/```json\s*\n?/g, "").replace(/```\s*$/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const category = CATEGORIES.includes(parsed.category) ? parsed.category : "other";
    const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));

    return {
      category,
      confidence,
      summary: parsed.summary || "",
      draftHtml: parsed.draftHtml || "",
      draftText: parsed.draftText || "",
      autoSendable:
        AUTO_SEND_CATEGORIES.includes(category as EmailCategory) &&
        confidence >= AUTO_SEND_CONFIDENCE_THRESHOLD &&
        category !== "spam",
    };
  } catch (error) {
    console.error("AI classification error:", error);
    return {
      category: "other",
      confidence: 0,
      summary: "AI classification failed",
      draftHtml: "",
      draftText: "",
      autoSendable: false,
    };
  }
}

/**
 * Send an auto-reply using the branded LuxApts template.
 * Only sends if auto-reply is enabled in platform settings.
 */
export async function sendAutoReply(
  emailId: string,
  toEmail: string,
  toName: string,
  originalSubject: string,
  draftHtml: string,
  draftText: string,
  threadId: string | null
): Promise<boolean> {
  const supabase = createAdminClient();

  // Check if auto-reply is enabled
  const { data: setting } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "ai_auto_reply_enabled")
    .maybeSingle();

  if (!setting || setting.value !== true) {
    return false;
  }

  const resend = getResendClient();
  const fromEmail = getFromEmail();
  const replySubject = originalSubject.startsWith("Re:")
    ? originalSubject
    : `Re: ${originalSubject}`;

  const safeDraftHtml = sanitizeDraftHtml(draftHtml);
  if (!safeDraftHtml.trim()) {
    // Nothing left after sanitization — don't send an empty branded shell
    return false;
  }
  const brandedHtml = buildBrandedTemplate(safeDraftHtml, toName);

  try {
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: replySubject,
      html: brandedHtml,
      text: draftText,
    });

    if (sendError) {
      console.error("Auto-reply send error:", sendError);
      return false;
    }

    // Extract from info
    const fromMatch = fromEmail.match(/^(.+?)\s*<(.+?)>$/);
    const fromName = fromMatch ? fromMatch[1].trim() : "LuxApts";
    const fromAddr = fromMatch ? fromMatch[2].trim() : fromEmail;

    // Store outbound auto-reply in DB
    await supabase.from("emails").insert({
      direction: "outbound",
      thread_id: threadId || emailId,
      resend_message_id: sendResult?.id || null,
      from_email: fromAddr,
      from_name: fromName,
      to_email: toEmail,
      to_name: toName,
      subject: replySubject,
      body_html: safeDraftHtml,
      body_text: draftText,
      status: "sent",
      metadata: { auto_sent: true },
    });

    // Mark inbound as replied
    await supabase
      .from("emails")
      .update({
        status: "replied",
        replied_at: new Date().toISOString(),
      })
      .eq("id", emailId);

    return true;
  } catch (error) {
    console.error("Auto-reply error:", error);
    return false;
  }
}

/** Build the branded LuxApts email template */
function buildBrandedTemplate(bodyHtml: string, recipientName?: string): string {
  const greeting = recipientName
    ? `<p style="margin: 0 0 16px 0;">Hi ${escapeHtml(recipientName)},</p>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #111111;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 32px 24px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 1px;">LuxApts</h1>
      <p style="margin: 8px 0 0; color: rgba(255,255,255,0.6); font-size: 13px;">Luxury Apartment Living</p>
    </div>

    <!-- Body -->
    <div style="padding: 32px 24px; color: #e0e0e0; font-size: 15px; line-height: 1.6;">
      ${greeting}
      ${bodyHtml}
    </div>

    <!-- Footer -->
    <div style="padding: 24px; border-top: 1px solid rgba(255,255,255,0.08); text-align: center;">
      <p style="margin: 0 0 8px; color: rgba(255,255,255,0.4); font-size: 12px;">
        LuxApts — Luxury Apartment Rentals
      </p>
      <p style="margin: 0; color: rgba(255,255,255,0.3); font-size: 11px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://luxapts.co"}" style="color: #60a5fa; text-decoration: none;">luxapts.co</a>
        &nbsp;·&nbsp; hello@luxapts.co
      </p>
    </div>
  </div>
</body>
</html>`;
}

export { buildBrandedTemplate, CATEGORIES, AUTO_SEND_CATEGORIES };
