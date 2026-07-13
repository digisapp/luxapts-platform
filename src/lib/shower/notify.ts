import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { newShowingLeadEmail } from "@/lib/email/templates";

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
      supabase
        .from("shower_certifications")
        .select("shower_id, showers:shower_id (id, user_id, display_name, status)")
        .eq("building_id", notification.buildingId)
        .eq("status", "certified")
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
        await resend.emails.send({
          from: fromEmail,
          to: [email],
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
        sent++;
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
