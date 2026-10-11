import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkShowerAuth, isShowerCertifiedForBuilding } from "@/lib/shower/auth";
import {
  LATE_CANCEL_HOURS,
  cancelNoticeHours,
  cancelWindowStart,
  claimBlockedByCancels,
  storedNoticeHours,
} from "@/lib/shower/claim-rules";
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

    // Check shower has no existing active claim (can only hold one at a time).
    // This is advisory only — two concurrent claims both pass it; the partial
    // unique index from migration 024 is what actually enforces it (see the
    // 23505 handling below).
    const { data: activeClaim } = await adminClient
      .from("showing_claims")
      .select("id, showing_lead_id")
      .eq("shower_id", auth.showerId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (activeClaim) {
      return apiError("You already have an active showing. Complete or cancel it before claiming another.", 409);
    }

    // Cancel cap (see claimBlockedByCancels): every claim reveals the renter's
    // contact details, so claim → cancel must not be repeatable at will. No
    // re-claiming a lead you cancelled, and too many recent cancels pause
    // claiming. Fails closed if the history can't be read.
    const [sameLeadCancel, recentCancels] = await Promise.all([
      adminClient
        .from("showing_claims")
        .select("id")
        .eq("shower_id", auth.showerId)
        .eq("showing_lead_id", leadId)
        .eq("status", "cancelled")
        .limit(1),
      adminClient
        .from("showing_claims")
        .select("cancelled_at")
        .eq("shower_id", auth.showerId)
        .eq("status", "cancelled")
        .gte("cancelled_at", cancelWindowStart()),
    ]);

    if (sameLeadCancel.error || recentCancels.error) {
      console.error("Claim cancel-history error:", sameLeadCancel.error ?? recentCancels.error);
      return apiError("Failed to claim lead", 500);
    }

    const cancelBlock = claimBlockedByCancels({
      cancelledThisLeadBefore: (sameLeadCancel.data ?? []).length > 0,
      recentCancelledAt: (recentCancels.data ?? []).map((c) => c.cancelled_at as string | null),
    });
    if (cancelBlock) {
      return apiError(cancelBlock.error, cancelBlock.status);
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

      // 23505 = unique_violation. showing_claims_one_active_per_shower
      // (migration 024) means this shower already holds an active claim —
      // the advisory check above misses that when two claims race. The other
      // is showing_claims_one_live_per_lead (migration 033; before it, a
      // plain UNIQUE on showing_lead_id that cancelled claims also tripped),
      // i.e. the lead already has a live claim.
      if (claimError?.code === "23505") {
        const detail = `${claimError.message} ${claimError.details ?? ""}`;
        if (detail.includes("one_active_per_shower")) {
          return apiError(
            "You already have an active claim. Complete or cancel it before claiming another.",
            409
          );
        }
        return apiError("This lead has already been claimed", 409);
      }

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

    // Notice hours. preferred_date/time are Miami wall clock — parsing them
    // offset-less read them as UTC on Vercel and under-counted the notice by
    // 4–5h, issuing late-cancel strikes for cancels made 2–6h ahead.
    const lead = (Array.isArray(claim.showing_leads) ? claim.showing_leads[0] : claim.showing_leads) as
      | { preferred_date?: string | null; preferred_time?: string | null }
      | null;
    const noticeHours = cancelNoticeHours(lead?.preferred_date, lead?.preferred_time);

    const isLateCancel = noticeHours < LATE_CANCEL_HOURS;

    // Conditional on the claim still being active, so a double-submitted
    // cancel can't reopen the lead or issue a strike twice.
    const { data: cancelledRows, error: cancelError } = await adminClient
      .from("showing_claims")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_notice_hours: storedNoticeHours(noticeHours),
        cancel_reason: cancelReason || null,
      })
      .eq("id", claim.id)
      .eq("status", "active")
      .select("id");

    if (cancelError) {
      console.error("Cancel claim update error:", cancelError);
      return apiError("Failed to cancel claim", 500);
    }
    if (!cancelledRows || cancelledRows.length !== 1) {
      return apiError("No active claim found", 404);
    }

    // Reopen the lead (only from a claimed state — never resurrect a lead an
    // admin has since cancelled).
    await adminClient
      .from("showing_leads")
      .update({ status: "open" })
      .eq("id", leadId)
      .in("status", ["claimed", "in_progress"]);

    // Issue a warning strike if late cancel (< LATE_CANCEL_HOURS notice)
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
