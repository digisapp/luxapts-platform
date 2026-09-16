import type { SupabaseClient } from "@supabase/supabase-js";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Bare address from `Name <addr>` or a plain `addr`. */
export function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

/**
 * Optional extra recipients for internal "new lead" notifications.
 *
 * This is now a convenience, not the delivery mechanism: every lead alert is
 * written straight into the admin inbox by recordInternalLeadAlert(), which
 * cannot bounce. FROM_EMAIL (hello@staycio.com) must never be used here — it
 * is a send-only identity on a domain with no MX record, and addressing
 * alerts to it is what silently swallowed six weeks of leads.
 *
 * Set LEAD_NOTIFY_EMAIL (comma-separated) only when you want a push to a
 * mailbox you actually read. Empty by default.
 */
export function getLeadNotificationRecipients(): string[] {
  const configured = (process.env.LEAD_NOTIFY_EMAIL || "")
    .split(/[,;\s]+/)
    .map(extractAddress)
    .filter((email) => EMAIL_RE.test(email));
  return Array.from(new Set(configured));
}

/**
 * Record a new lead in the admin inbox (/admin/email) as an inbound message.
 *
 * Internal alerts must not depend on SMTP: the previous design mailed them to
 * an address that could not receive, so 65 leads went unseen. Writing the row
 * directly means the alert is visible the moment the lead is created, with no
 * DNS, deliverability or provider in the path. Never throws — a failure here
 * must not fail the lead capture itself.
 */
export async function recordInternalLeadAlert(
  supabase: SupabaseClient,
  alert: {
    leadId: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    subject: string;
    html: string;
    sourceLabel: string;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from("emails").insert({
      direction: "inbound",
      from_email: alert.email || "leads@staycio.com",
      from_name: alert.name || alert.sourceLabel,
      to_email: "leads@staycio.com",
      to_name: "Staycio Leads",
      reply_to: alert.email || null,
      subject: alert.subject,
      body_html: alert.html,
      status: "received",
      lead_id: alert.leadId,
      metadata: {
        kind: "lead_alert",
        source: alert.sourceLabel,
        phone: alert.phone || null,
      },
    });
    if (error) console.error("Lead alert inbox write failed:", alert.leadId, error);
  } catch (err) {
    console.error("Lead alert inbox write threw:", alert.leadId, err);
  }
}

/**
 * Reply-To for renter-facing mail (tour confirmations, alerts, welcome).
 *
 * Replies must not go to FROM_EMAIL: staycio.com has no MX record, so they
 * would bounce. They go to the Resend inbound domain instead, which lands the
 * reply in the admin inbox threaded against the lead. REPLY_TO_EMAIL
 * overrides it once a real mailbox exists on the apex.
 */
const DEFAULT_REPLY_TO = "replies@inbound.staycio.com";

export function getReplyToAddress(): string | undefined {
  const configured = extractAddress(process.env.REPLY_TO_EMAIL || "");
  if (EMAIL_RE.test(configured)) return configured;
  return DEFAULT_REPLY_TO;
}
