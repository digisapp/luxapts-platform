import { getResendClient } from "@/lib/resend/client";
import { escapeHtml } from "@/lib/utils";
import { buildEmailShell, htmlToText } from "./branded";
import { getAdminFromAddress, isOurInboundAddress, parseEmailAddress } from "./inbound-address";
import { getLeadNotificationRecipients } from "./recipients";
import { getAppUrl } from "./unsubscribe";

/**
 * Phone alert for new mail in the admin inbox.
 *
 * The inbox only shows new mail while /admin/email is open, so a renter's
 * reply could sit unseen for days. Every stored inbound message now also
 * sends a short alert to the owner's own mailbox (the one on their phone),
 * with the message, Stacy's summary, whether she already answered, and a
 * link that opens that conversation.
 *
 * Loop safety matters here, because staycio.com itself receives mail now:
 * an alert must never be addressed to one of our own inbound addresses, and
 * an alert that somehow comes back in must never raise another alert.
 */

export const INBOX_ALERT_HEADER = "X-Staycio-Inbox-Alert";

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/**
 * Who gets alerted. INBOX_NOTIFY_EMAIL (comma-separated) overrides; otherwise
 * the same mailbox that receives new-lead alerts (LEAD_NOTIFY_EMAIL). Our own
 * receiving addresses are dropped: alerting them would feed the inbox its
 * own alerts.
 */
export function getInboxAlertRecipients(): string[] {
  const override = (process.env.INBOX_NOTIFY_EMAIL || "")
    .split(/[,;\s]+/)
    .map((raw) => parseEmailAddress(raw).email)
    .filter((email) => EMAIL_RE.test(email));
  const list = override.length > 0 ? override : getLeadNotificationRecipients();
  return Array.from(new Set(list.map((e) => e.toLowerCase()))).filter((e) => !isOurInboundAddress(e));
}

/** Why this message should not raise an alert, or null when it should. */
export function inboxAlertSkipReason(args: {
  from: string;
  headers?: Record<string, string | string[] | null | undefined> | null;
  recipients: string[];
}): string | null {
  if (args.recipients.length === 0) return "no alert recipient configured (LEAD_NOTIFY_EMAIL / INBOX_NOTIFY_EMAIL)";
  const from = parseEmailAddress(args.from).email.toLowerCase();
  if (!from) return "no sender address";
  const headerNames = Object.keys(args.headers || {}).map((k) => k.toLowerCase());
  if (headerNames.includes(INBOX_ALERT_HEADER.toLowerCase())) return "message is itself an inbox alert";
  if (isOurInboundAddress(from)) return "sent from our own domain";
  // The owner writing in (a test, or a reply to an alert) needs no alert, and
  // answering it would bounce alerts back and forth.
  if (args.recipients.includes(from)) return "sender is the alert recipient";
  return null;
}

/** The sender's own words: quoted history, signatures and blank runs removed. */
export function messageSnippet(text: string | null | undefined, html: string | null | undefined, max = 600): string {
  let body = (text && text.trim() ? text : html ? htmlToText(html) : "").replace(/\r\n/g, "\n");
  // Cut at the quoted original ("On … wrote:", Outlook's header block) and at
  // the signature delimiter.
  const cuts = [
    body.search(/^\s*On .{5,200}wrote:\s*$/m),
    body.search(/^\s*-{2,}\s*Original Message\s*-{2,}/im),
    body.search(/^\s*From: .+\n\s*Sent: /m),
    body.search(/^-- ?$/m),
  ].filter((i) => i >= 0);
  if (cuts.length > 0) body = body.slice(0, Math.min(...cuts));
  body = body
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return body.length > max ? `${body.slice(0, max).trimEnd()}…` : body;
}

export interface InboxAlertInput {
  /** Stored email id; the link opens it. */
  id: string;
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  /** Stacy's one-line summary, when the AI ran. */
  summary?: string | null;
  /** True when the AI already answered this message. */
  autoReplied?: boolean;
  /** The building the lead came from ("Downtown 6"), when known. */
  building?: string | null;
}

export function buildInboxAlert(input: InboxAlertInput): { subject: string; html: string; text: string; link: string } {
  const who = (input.fromName || "").trim() || input.from;
  const firstName = who.includes("@") ? "them" : who.split(/\s+/)[0];
  const link = `${getAppUrl()}/admin/email?email=${encodeURIComponent(input.id)}`;
  const snippet = messageSnippet(input.text, input.html) || "(no text in the message)";
  const status = input.autoReplied
    ? "Stacy already replied. No action needed unless you want to add something."
    : "Waiting for your reply.";

  // The message comes first: the lock screen previews the first line.
  const lines = [
    snippet,
    `${who} <${input.from}>${input.building ? ` · ${input.building}` : ""}, to ${input.to}`,
    ...(input.summary ? [`Stacy's read: ${input.summary}`] : []),
    status,
    `Open it: ${link}`,
    `Answer from the inbox. Replying to this alert does not reach ${firstName}.`,
  ];

  const p = (inner: string, muted = false) =>
    `<p style="margin:0 0 16px 0;${muted ? "color:#666666;font-size:13px;" : ""}">${inner}</p>`;
  const bodyHtml = [
    p(escapeHtml(snippet).replace(/\n/g, "<br>")),
    p(
      `${escapeHtml(who)} &lt;${escapeHtml(input.from)}&gt;${input.building ? ` &middot; ${escapeHtml(input.building)}` : ""}, to ${escapeHtml(input.to)}`,
      true
    ),
    ...(input.summary ? [p(`Stacy&rsquo;s read: ${escapeHtml(input.summary)}`, true)] : []),
    p(`<strong>${escapeHtml(status)}</strong>`),
    p(`<a href="${escapeHtml(link)}" style="color:#1a56db;">Open this conversation in the inbox</a>`),
    p(`Answer from the inbox. Replying to this alert does not reach ${escapeHtml(firstName)}.`, true),
  ].join("\n");

  // "Name: subject" keeps each conversation's alerts grouped in the mail app.
  const subject = `${who}: ${input.subject}`.slice(0, 200);
  return { subject, html: buildEmailShell(bodyHtml, null, subject), text: `${lines.join("\n\n")}\n`, link };
}

/** Sends the alert. Never throws; returns why nothing was sent. */
export async function sendInboxAlert(
  input: InboxAlertInput & { headers?: Record<string, string | string[] | null | undefined> | null }
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const recipients = getInboxAlertRecipients();
    const skip = inboxAlertSkipReason({ from: input.from, headers: input.headers, recipients });
    if (skip) return { sent: false, reason: skip };
    if (!process.env.RESEND_API_KEY) return { sent: false, reason: "RESEND_API_KEY is not set" };

    const alert = buildInboxAlert(input);
    const { error } = await getResendClient().emails.send(
      {
        from: `Staycio Inbox <${getAdminFromAddress()}>`,
        to: recipients,
        subject: alert.subject,
        html: alert.html,
        text: alert.text,
        headers: { [INBOX_ALERT_HEADER]: "1", "Auto-Submitted": "auto-generated" },
      },
      // Svix retries the webhook; one alert per stored message.
      { idempotencyKey: `inbox-alert-${input.id}` }
    );
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
