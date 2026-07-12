import type { SupabaseClient } from "@supabase/supabase-js";

// Auto-bridge a renter lead into the shower showing-lead pipeline.
//
// A tour request with a named client, a contact method, a target building, and
// a requested date becomes an open showing lead that certified showers can
// claim — no admin re-posting. Attribution flows back via source_lead_id.

const AUTO_BRIDGE_EXPIRY_HOURS = 24;

export interface BridgeableLead {
  leadId: string;
  buildingId: string | null | undefined;
  name: string | null | undefined;
  email: string | null | undefined;
  phone: string | null | undefined;
  tourDate: string | null | undefined; // YYYY-MM-DD
  tourTime: string | null | undefined; // HH:MM
  notes: string | null | undefined;
}

export function isBridgeable(lead: BridgeableLead): boolean {
  return Boolean(
    lead.buildingId && lead.name && (lead.email || lead.phone) && lead.tourDate
  );
}

// Creates the showing lead and logs a lead_event. Never throws — a bridge
// failure must not fail the lead creation it rides on.
export async function bridgeLeadToShowing(
  supabase: SupabaseClient,
  lead: BridgeableLead
): Promise<string | null> {
  if (!isBridgeable(lead)) return null;

  try {
    const expiresAt = new Date(
      Date.now() + AUTO_BRIDGE_EXPIRY_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { data: showingLead, error } = await supabase
      .from("showing_leads")
      .insert({
        building_id: lead.buildingId,
        client_name: lead.name,
        client_email: lead.email || null,
        client_phone: lead.phone || null,
        preferred_date: lead.tourDate,
        preferred_time: lead.tourTime || "12:00",
        special_instructions: lead.notes ? lead.notes.slice(0, 500) : null,
        status: "open",
        source_lead_id: lead.leadId,
        posted_by: null, // system-generated, not admin-posted
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (error || !showingLead) {
      // Unique violation on source_lead_id means it was already bridged — fine.
      if (error && error.code !== "23505") {
        console.error("Lead bridge insert error:", error);
      }
      return null;
    }

    await supabase.from("lead_events").insert({
      lead_id: lead.leadId,
      type: "showing_lead_created",
      payload: {
        showing_lead_id: showingLead.id,
        building_id: lead.buildingId,
        preferred_date: lead.tourDate,
        method: "auto_bridged",
      },
    });

    return showingLead.id;
  } catch (err) {
    console.error("Lead bridge error:", err);
    return null;
  }
}
