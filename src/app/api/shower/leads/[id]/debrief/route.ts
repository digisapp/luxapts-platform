import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkShowerAuth } from "@/lib/shower/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const debriefSchema = z.object({
  client_showed_up: z.boolean(),
  interest_level: z.number().int().min(1).max(5).optional(),
  application_likelihood: z
    .enum(["high", "medium", "low", "already_interested"])
    .optional(),
  units_of_interest: z.string().max(500).optional(),
  client_objections: z.string().max(1000).optional(),
  broker_notes: z.string().max(1000).optional(),
  photo_urls: z.array(z.string().url()).max(10).optional(),
});

// POST /api/shower/leads/[id]/debrief — submit post-showing debrief
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkShowerAuth();
    if (!auth.isShower) {
      return apiError(auth.error, auth.status);
    }

    const { id: leadId } = await params;
    const rawBody = await req.json();
    const parsed = debriefSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const body = parsed.data;
    const adminClient = createAdminClient();

    // Verify this shower owns the CURRENTLY-ACTIVE claim. Filtering on status
    // matters: without it a shower's old cancelled claim would still match, and
    // they could overwrite the lead state of whichever shower now holds the
    // active claim.
    const { data: claim } = await adminClient
      .from("showing_claims")
      .select("id, status")
      .eq("showing_lead_id", leadId)
      .eq("shower_id", auth.showerId)
      .eq("status", "active")
      .maybeSingle();

    if (!claim) {
      // Distinguish an already-submitted debrief from no claim at all.
      const { data: completed } = await adminClient
        .from("showing_claims")
        .select("id")
        .eq("showing_lead_id", leadId)
        .eq("shower_id", auth.showerId)
        .eq("status", "completed")
        .maybeSingle();
      if (completed) {
        return apiError("Debrief already submitted", 409);
      }
      return apiError("You do not have an active claim on this lead", 403);
    }

    // Check for duplicate debrief
    const { data: existingDebrief } = await adminClient
      .from("showing_debriefs")
      .select("id")
      .eq("showing_lead_id", leadId)
      .single();

    if (existingDebrief) {
      return apiError("Debrief already submitted for this showing", 409);
    }

    // If client no-showed, we mark it differently
    const isNoShow = !body.client_showed_up;

    const { data: debrief, error: debriefError } = await adminClient
      .from("showing_debriefs")
      .insert({
        showing_lead_id: leadId,
        shower_id: auth.showerId,
        client_showed_up: body.client_showed_up,
        interest_level: body.interest_level || null,
        application_likelihood: body.application_likelihood || null,
        units_of_interest: body.units_of_interest || null,
        client_objections: body.client_objections || null,
        broker_notes: body.broker_notes || null,
        photo_urls: body.photo_urls || [],
      })
      .select("id, submitted_at")
      .single();

    if (debriefError || !debrief) {
      console.error("Debrief insert error:", debriefError);
      return apiError("Failed to submit debrief", 500);
    }

    // Update claim status
    await adminClient
      .from("showing_claims")
      .update({ status: isNoShow ? "no_show" : "completed" })
      .eq("id", claim.id);

    // Update lead status
    await adminClient
      .from("showing_leads")
      .update({ status: isNoShow ? "no_show" : "completed" })
      .eq("id", leadId);

    // If client no-showed, log a strike
    if (isNoShow) {
      await adminClient.from("shower_strikes").insert({
        shower_id: auth.showerId,
        showing_lead_id: leadId,
        type: "no_show",
        description: "Client no-show reported by shower",
        created_by: auth.userId,
      });
    }

    return apiSuccess({
      debrief_id: debrief.id,
      submitted_at: debrief.submitted_at,
      message: isNoShow
        ? "No-show recorded. A showing fee will not be issued for no-show appointments."
        : "Debrief submitted. Your $150 showing fee will be released after admin review.",
    }, 201);
  } catch (error) {
    console.error("Submit debrief error:", error);
    return apiError("Internal server error", 500);
  }
}
