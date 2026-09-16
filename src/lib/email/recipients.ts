import type { SupabaseClient } from "@supabase/supabase-js";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Bare address from `Name <addr>` or a plain `addr`. */
export function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

/**
 * Where internal "new lead" notifications are delivered.
 *
 * FROM_EMAIL (hello@staycio.com) is a send-only identity: staycio.com has no
 * MX record, so every notification addressed to it bounced and the leads sat
 * unnoticed in the admin inbox. Recipients now come from LEAD_NOTIFY_EMAIL
 * (comma-separated), falling back to the admin accounts' sign-in emails.
 * Returns [] when nothing usable is configured so callers can log loudly.
 */
export async function getLeadNotificationRecipients(
  supabase: SupabaseClient
): Promise<string[]> {
  const configured = (process.env.LEAD_NOTIFY_EMAIL || "")
    .split(/[,;\s]+/)
    .map(extractAddress)
    .filter((email) => EMAIL_RE.test(email));
  if (configured.length > 0) return Array.from(new Set(configured));

  try {
    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(10);

    const emails: string[] = [];
    for (const admin of admins ?? []) {
      const { data } = await supabase.auth.admin.getUserById(admin.id);
      const email = data?.user?.email;
      if (email && EMAIL_RE.test(email)) emails.push(email);
    }
    if (emails.length > 0) return Array.from(new Set(emails));
  } catch (err) {
    console.error("Admin recipient lookup failed:", err);
  }

  console.error(
    "No lead notification recipients: set LEAD_NOTIFY_EMAIL (FROM_EMAIL cannot receive mail)"
  );
  return [];
}

/**
 * Reply-To for renter-facing mail (tour confirmations, alerts, welcome).
 * Replies to FROM_EMAIL bounce for the same reason as above, so point them
 * at the first configured internal inbox when one exists.
 */
export function getReplyToAddress(): string | undefined {
  const first = (process.env.LEAD_NOTIFY_EMAIL || "")
    .split(/[,;\s]+/)
    .map(extractAddress)
    .find((email) => EMAIL_RE.test(email));
  return first || undefined;
}
