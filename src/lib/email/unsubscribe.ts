import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * CAN-SPAM unsubscribe links for bulk (campaign) mail.
 *
 * The link is stateless: the token is an HMAC-SHA256 of the lead id keyed on
 * CRON_SECRET, so no extra table is needed and the id in the URL cannot be
 * swapped for someone else's lead without forging the MAC.
 */

function getSecret(): string | null {
  const secret = process.env.CRON_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

/** HMAC-SHA256(leadId, CRON_SECRET) as hex, or null when no secret is set. */
export function unsubscribeToken(leadId: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(leadId).digest("hex");
}

/** Constant-time token check. False when the secret is missing or the token is malformed. */
export function verifyUnsubscribeToken(leadId: string, token: string): boolean {
  const expected = unsubscribeToken(leadId);
  if (!expected || !token) return false;
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(token, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://staycio.com").replace(/\/+$/, "");
}

/** Absolute unsubscribe URL for a lead, or null when no secret is configured. */
export function unsubscribeUrl(leadId: string): string | null {
  const token = unsubscribeToken(leadId);
  if (!token) return null;
  return `${getAppUrl()}/api/email/unsubscribe?lead=${encodeURIComponent(leadId)}&t=${token}`;
}

/**
 * Footer appended to every bulk campaign email. Returns "" when no token can
 * be generated — callers must treat that as "do not send bulk mail".
 */
export function unsubscribeFooterHtml(leadId: string): string {
  const url = unsubscribeUrl(leadId);
  if (!url) return "";
  return `
    <p style="margin-top: 16px; color: #999; font-size: 11px; line-height: 1.5;">
      You are receiving this because you enquired about an apartment on Staycio.
      <a href="${url}" style="color: #999;">Unsubscribe</a> to stop receiving these emails.
    </p>
  `;
}
