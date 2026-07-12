import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkShowerAuth, isShowerCertifiedForBuilding } from "@/lib/shower/auth";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/shower/leads/[id]/claim — claim an open showing lead
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkShowerAuth();
    if (!auth.isShower) {
      return apiError(auth.error, auth.status);
    }

    const { id: leadId } = await params;
    const adminClient = createAdminClient();

    // Load the lead
    const { data: lead, error: leadError } = await adminClient
      .from("showing_leads")
      .select("id, status, building_id, preferred_date, preferred_time, client_name, client_email, client_phone, special_instructions, expires_at, source_lead_id")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return apiError("Lead not found", 404);
    }

    if (lead.status !== "open") {
      return apiError("This lead has already been claimed", 409);
    }

    // Check expiry
    if (lead.expires_at && new Date(lead.expires_at) < new Date()) {
      return apiError("This lead has expired", 410);
    }

    // Check certification for this building
    const certified = await isShowerCertifiedForBuilding(auth.showerId, lead.building_id);
    if (!certified) {
      return apiError("You are not certified for this building", 403);
    }

    // Check shower has no existing active claim (can only hold one at a time)
    const { data: activeClaim } = await adminClient
      .from("showing_claims")
      .select("id, showing_lead_id")
      .eq("shower_id", auth.showerId)
      .eq("status", "active")
      .limit(1)
      .single();

    if (activeClaim) {
      return apiError("You already have an active showing. Complete or cancel it before claiming another.", 409);
    }

    // Claim atomically — flip lead status open -> claimed as an optimistic
    // lock. A Supabase update matching zero rows returns error: null, so we
    // must inspect the returned rows: exactly one means we won the race.
    const { data: claimedRows, error: updateError } = await adminClient
      .from("showing_leads")
      .update({ status: "claimed" })
      .eq("id", leadId)
      .eq("status", "open") // optimistic lock
      .select("id");

    if (updateError || !claimedRows || claimedRows.length !== 1) {
      return apiError("Lead was just claimed by another Shower", 409);
    }

    const { data: claim, error: claimError } = await adminClient
      .from("showing_claims")
      .insert({
        showing_lead_id: leadId,
        shower_id: auth.showerId,
        status: "active",
      })
      .select("id, claimed_at")
      .single();

    if (claimError || !claim) {
      // Roll back the lead status
      await adminClient
        .from("showing_leads")
        .update({ status: "open" })
        .eq("id", leadId);
      console.error("Claim insert error:", claimError);
      return apiError("Failed to claim lead", 500);
    }

    // If this showing lead was auto-bridged from a renter lead, advance the
    // source lead's funnel status and log the claim for attribution.
    if (lead.source_lead_id) {
      await adminClient
        .from("leads")
        .update({ status: "touring" })
        .eq("id", lead.source_lead_id)
        .in("status", ["new", "contacted"]);
      await adminClient.from("lead_events").insert({
        lead_id: lead.source_lead_id,
        type: "tour_claimed",
        payload: {
          showing_lead_id: lead.id,
          shower_id: auth.showerId,
          preferred_date: lead.preferred_date,
        },
      });
    }

    return apiSuccess({
      claim_id: claim.id,
      claimed_at: claim.claimed_at,
      lead: {
        id: lead.id,
        client_name: lead.client_name,
        client_email: lead.client_email,
        client_phone: lead.client_phone,
        preferred_date: lead.preferred_date,
        preferred_time: lead.preferred_time,
        special_instructions: lead.special_instructions,
      },
    }, 201);
  } catch (error) {
    console.error("Claim lead error:", error);
    return apiError("Internal server error", 500);
  }
}

// DELETE /api/shower/leads/[id]/claim — cancel a claim
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkShowerAuth();
    if (!auth.isShower) {
      return apiError(auth.error, auth.status);
    }

    const { id: leadId } = await params;
    const body = await req.json().catch(() => ({}));
    const cancelReason: string = typeof body.reason === "string" ? body.reason.slice(0, 500) : "";

    const adminClient = createAdminClient();

    // Find the active claim
    const { data: claim } = await adminClient
      .from("showing_claims")
      .select("id, claimed_at, showing_leads:showing_lead_id(preferred_date, preferred_time)")
      .eq("showing_lead_id", leadId)
      .eq("shower_id", auth.showerId)
      .eq("status", "active")
      .single();

    if (!claim) {
      return apiError("No active claim found", 404);
    }

    // Calculate notice hours
    const lead = Array.isArray(claim.showing_leads) ? claim.showing_leads[0] : claim.showing_leads;
    let noticeHours = 99; // default: plenty of notice
    if (lead && "preferred_date" in lead && "preferred_time" in lead) {
      const showingDateTime = new Date(`${lead.preferred_date}T${lead.preferred_time}`);
      noticeHours = (showingDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
    }

    const isLateCancel = noticeHours < 2;

    await adminClient
      .from("showing_claims")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_notice_hours: Math.max(0, noticeHours),
        cancel_reason: cancelReason || null,
      })
      .eq("id", claim.id);

    // Reopen the lead
    await adminClient
      .from("showing_leads")
      .update({ status: "open" })
      .eq("id", leadId);

    // Issue a warning strike if late cancel (< 2 hours notice)
    if (isLateCancel) {
      const { error: strikeError } = await adminClient.from("shower_strikes").insert({
        shower_id: auth.showerId,
        showing_lead_id: leadId,
        type: "late_cancel",
        description: `Cancelled with less than 2 hours notice. Reason: ${cancelReason || "none provided"}`,
        created_by: auth.userId,
      });
      if (strikeError) {
        console.error("Failed to issue late cancel strike:", strikeError);
      }
    }

    return apiSuccess({ cancelled: true, strike_issued: isLateCancel });
  } catch (error) {
    console.error("Cancel claim error:", error);
    return apiError("Internal server error", 500);
  }
}
