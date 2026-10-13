import type { SupabaseClient } from "@supabase/supabase-js";
import { getFromEmail, getResendClient } from "@/lib/resend/client";
import { newLeadEmail } from "@/lib/email/templates";
import { getLeadNotificationRecipients, recordInternalLeadAlert } from "@/lib/email/recipients";
import { listingLeadNotes, type ParsedListingLead } from "@/lib/email/parse-listing-lead";
import { autoAssignAgent } from "@/lib/leads/routing";

/**
 * A listing-site inquiry (parse-listing-lead.ts) as a lead on /admin/leads,
 * linked to the inbox email it arrived in. Called from the Resend webhook
 * after the email is stored.
 *
 * - One lead per renter and property: the same renter asking about the same
 *   property again within 30 days is added to their lead (a timeline note,
 *   plus any contact detail the lead was missing), not made a second lead.
 * - An inquiry that needs review is still a lead, flagged needs_review. So is
 *   one whose sender failed DMARC: From is forgeable, so such a lead never
 *   merges into an existing one or fills in its details.
 * - A new lead gets the same alert as a form lead: the "New lead" row in
 *   /admin/email, plus an email to LEAD_NOTIFY_EMAIL when that is set.
 *
 * Needs migration 038 (the listing sources + leads.needs_review).
 */

const REPEAT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function createListingLead(
  supabase: SupabaseClient,
  { lead, emailId, senderVerified }: { lead: ParsedListingLead; emailId: string; senderVerified: boolean }
): Promise<{ leadId: string; created: boolean } | null> {
  const reviewReasons = [...lead.reviewReasons];
  if (!senderVerified) {
    reviewReasons.push(`the sender did not pass DMARC, so it may not really be from ${lead.sourceLabel}`);
  }
  const needsReview = reviewReasons.length > 0;
  // source_detail holds the property, as it holds the domain for a microsite lead.
  const property = lead.propertyName;

  // Threading may already have linked the email to a lead; that link stays.
  const linkEmail = (leadId: string) =>
    supabase.from("emails").update({ lead_id: leadId }).eq("id", emailId).is("lead_id", null);

  if (lead.email && senderVerified) {
    const sameRenter = supabase
      .from("leads")
      .select("id, name, user_phone, move_in_date, beds, created_at")
      .eq("source", lead.source)
      .eq("user_email", lead.email);
    const { data: existing } = await (property
      ? sameRenter.eq("source_detail", property)
      : sameRenter.is("source_detail", null)
    )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && Date.now() - new Date(existing.created_at).getTime() < REPEAT_WINDOW_MS) {
      const missing: Record<string, unknown> = {};
      if (!existing.name && lead.name) missing.name = lead.name;
      if (!existing.user_phone && lead.phone) missing.user_phone = lead.phone;
      if (!existing.move_in_date && lead.moveInDate) missing.move_in_date = lead.moveInDate;
      if (existing.beds == null && lead.beds != null) missing.beds = lead.beds;
      if (Object.keys(missing).length > 0) await supabase.from("leads").update(missing).eq("id", existing.id);

      const asked = [lead.unit && `Unit: ${lead.unit}`, lead.moveIn && `Move-in: ${lead.moveIn}`, lead.message]
        .filter(Boolean)
        .join(" · ");
      await supabase.from("lead_events").insert({
        lead_id: existing.id,
        type: "note_added",
        payload: {
          note: `Asked again on ${lead.sourceLabel}${asked ? `: ${asked}` : ""}`,
          source: lead.source,
          email_id: emailId,
        },
      });
      await linkEmail(existing.id);
      console.log(`[Listing lead] Email ${emailId} added to lead ${existing.id}`);
      return { leadId: existing.id, created: false };
    }
  }

  // The property's building in the catalog, when there is one: its city, and
  // a target on the lead page. LIKE wildcards escaped, as in microsite-leads.
  let building: { id: string; city_id: string | null } | null = null;
  if (property) {
    const { data } = await supabase
      .from("buildings")
      .select("id, city_id")
      .ilike("name", property.replace(/[\\%_]/g, "\\$&").replace(/\*/g, ""))
      .limit(1)
      .maybeSingle();
    building = data ?? null;
  }
  // Staycio's listings on these sites are in Miami.
  const cities = supabase.from("cities").select("id, name");
  const { data: city } = await (building?.city_id
    ? cities.eq("id", building.city_id)
    : cities.eq("slug", "miami")
  ).maybeSingle();

  const notes = listingLeadNotes(lead, reviewReasons);
  const { data: inserted, error } = await supabase
    .from("leads")
    .insert({
      source: lead.source,
      source_detail: property,
      city_id: city?.id ?? null,
      name: lead.name,
      user_email: lead.email,
      user_phone: lead.phone,
      beds: lead.beds,
      move_in_date: lead.moveInDate,
      notes,
      status: "new",
      needs_review: needsReview,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    // The email itself is safe in the inbox. A check-constraint or
    // missing-column error here means migration 038 is not applied.
    console.error(`[Listing lead] Lead insert failed for email ${emailId}:`, error);
    return null;
  }
  const leadId: string = inserted.id;

  if (building) {
    await supabase.from("lead_targets").insert({ lead_id: leadId, building_id: building.id, rank: 1 });
  }
  await supabase.from("lead_events").insert({
    lead_id: leadId,
    type: "lead_created",
    payload: { source: lead.source, property, city: city?.name ?? null, email_id: emailId, needs_review: needsReview },
  });
  await linkEmail(leadId);
  console.log(`[Listing lead] Created lead ${leadId} from email ${emailId}${needsReview ? " (needs review)" : ""}`);

  const subject = `${needsReview ? "Needs review: " : ""}New ${lead.sourceLabel} Lead: ${lead.name || "Anonymous"} · ${
    property || city?.name || lead.sourceLabel
  }`;
  const alertHtml = newLeadEmail({
    leadId,
    city: city?.name ?? "Unknown city",
    source: lead.sourceLabel,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    beds: lead.beds,
    moveInDate: lead.moveIn,
    notes,
    buildingName: property,
  });
  await recordInternalLeadAlert(supabase, {
    leadId,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    subject,
    html: alertHtml,
    sourceLabel: lead.sourceLabel,
  });

  // Optional push to a mailbox someone actually reads. Skipped when
  // LEAD_NOTIFY_EMAIL is unset. Resend v6 reports failures on `error`.
  const recipients = getLeadNotificationRecipients();
  if (process.env.RESEND_API_KEY && recipients.length > 0) {
    try {
      const { error: notifyError } = await getResendClient().emails.send({
        from: getFromEmail(),
        to: recipients,
        // Never a Reply-To taken from mail that failed DMARC.
        replyTo: senderVerified && lead.email ? lead.email : undefined,
        subject,
        html: alertHtml,
      });
      if (notifyError) console.error("[Listing lead] Notification failed:", leadId, notifyError);
    } catch (err) {
      console.error("[Listing lead] Notification failed:", leadId, err);
    }
  }

  if (city?.id) {
    const agentId = await autoAssignAgent(supabase, leadId, city.id);
    if (agentId) {
      await supabase.from("lead_events").insert({
        lead_id: leadId,
        type: "agent_assigned",
        payload: { agent_user_id: agentId, method: "auto_routed" },
      });
    }
  }

  return { leadId, created: true };
}
