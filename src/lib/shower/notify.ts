import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { newShowingLeadEmail } from "@/lib/email/templates";
import { getReplyToAddress } from "@/lib/email/recipients";

// Email every certified, approved shower for a building when a new showing
// lead opens. Client PII is deliberately excluded — it unlocks on claim.
//
// Never throws: notification failure must not fail the posting that rides on it.

const MAX_NOTIFICATIONS = 20;

export interface ShowingLeadNotification {
  buildingId: string;
  preferredDate: string;
  preferredTime?: string | null;
  unitType?: string | null;
  expiresAt?: string | null;
}

export async function notifyCertifiedShowers(
  supabase: SupabaseClient,
  notification: ShowingLeadNotification
): Promise<number> {
  if (!process.env.RESEND_API_KEY) return 0;

  try {
    const [{ data: building }, { data: certs }] = await Promise.all([
      supabase
        .from("buildings")
        .select("name, neighborhoods:neighborhood_id (name)")
        .eq("id", notification.buildingId)
        .single(),
      // The approved-shower filter used to run in JS AFTER .limit(20), so a
      // building whose first 20 certifications were pending/suspended notified
      // nobody. Filter (and drop expired certifications) in the query, then
      // limit. `!inner` is what makes the embedded status filter actually
      // restrict the parent rows.
      supabase
        .from("shower_certifications")
        .select("shower_id, showers:shower_id!inner (id, user_id, display_name, status)")
        .eq("building_id", notification.buildingId)
        .eq("status", "certified")
        .eq("showers.status", "approved")
        .gt("expires_at", new Date().toISOString())
        .limit(MAX_NOTIFICATIONS),
    ]);

    if (!building || !certs || certs.length === 0) return 0;

    const hood = Array.isArray(building.neighborhoods)
      ? building.neighborhoods[0]
      : building.neighborhoods;

    const showers = certs
      .map((c) => (Array.isArray(c.showers) ? c.showers[0] : c.showers))
      .filter(
        (s): s is { id: string; user_id: string; display_name: string; status: string } =>
          Boolean(s) && s!.status === "approved"
      );

    if (showers.length === 0) return 0;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.FROM_EMAIL || "Staycio <hello@staycio.com>";
    let sent = 0;

    for (const shower of showers) {
      // Shower emails live on auth.users; resolve via the admin API
      const { data: userData } = await supabase.auth.admin.getUserById(shower.user_id);
      const email = userData?.user?.email;
      if (!email) continue;

      try {
        // Resend v6 returns { data, error } and never throws for API errors,
        // so the old catch-only path counted rejected mail as sent.
        const { error } = await resend.emails.send({
          from: fromEmail,
          to: [email],
          replyTo: getReplyToAddress(),
          subject: `New showing available — ${building.name}, ${notification.preferredDate}`,
          html: newShowingLeadEmail({
            displayName: shower.display_name,
            buildingName: building.name,
            neighborhood: (hood as { name: string } | null)?.name ?? null,
            preferredDate: notification.preferredDate,
            preferredTime: notification.preferredTime,
            unitType: notification.unitType,
            expiresAt: notification.expiresAt,
          }),
        });

        if (error) {
          console.error(`Shower notification rejected for ${shower.id}:`, error);
        } else {
          sent++;
        }
      } catch (err) {
        console.error(`Shower notification failed for ${shower.id}:`, err);
      }
    }

    return sent;
  } catch (err) {
    console.error("Shower notification error:", err);
    return 0;
  }
}
