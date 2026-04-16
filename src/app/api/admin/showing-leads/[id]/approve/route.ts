import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkAdminAuth } from "@/lib/admin/auth";
import { logAuditEvent, AuditAction } from "@/lib/admin/audit";
import { createAdminClient } from "@/lib/supabase/server";
import { getShowerSettings } from "@/lib/shower/settings";
import { z } from "zod";

const approveSchema = z.object({
  admin_notes: z.string().max(500).optional(),
});

// POST /api/admin/showing-leads/[id]/approve — approve debrief + release $150 showing fee
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { id: leadId } = await params;
    const rawBody = await req.json().catch(() => ({}));
    const parsed = approveSchema.safeParse(rawBody);
    const adminNotes = parsed.success ? parsed.data.admin_notes : undefined;

    const [adminClient, settings] = [createAdminClient(), await getShowerSettings()];
    const SHOWING_FEE = settings.showing_fee;

    // Load debrief
    const { data: debrief, error: debriefError } = await adminClient
      .from("showing_debriefs")
      .select("id, shower_id, admin_approved_at, client_showed_up")
      .eq("showing_lead_id", leadId)
      .single();

    if (debriefError || !debrief) {
      return apiError("Debrief not found for this lead", 404);
    }

    if (debrief.admin_approved_at) {
      return apiError("Debrief already approved", 409);
    }

    if (!debrief.client_showed_up) {
      return apiError("Cannot approve showing fee for a no-show", 400);
    }

    // Approve the debrief
    await adminClient
      .from("showing_debriefs")
      .update({
        admin_approved_at: new Date().toISOString(),
        admin_approved_by: auth.userId,
        admin_notes: adminNotes || null,
      })
      .eq("id", debrief.id);

    // Create approved showing fee earnings record
    const { data: earning, error: earningError } = await adminClient
      .from("shower_earnings")
      .insert({
        shower_id: debrief.shower_id,
        showing_lead_id: leadId,
        type: "showing_fee",
        amount: SHOWING_FEE,
        status: "approved",
        description: `Showing fee — debrief approved`,
        approved_at: new Date().toISOString(),
      })
      .select("id, amount")
      .single();

    if (earningError || !earning) {
      console.error("Create earning error:", earningError);
      return apiError("Debrief approved but failed to create earnings record", 500);
    }

    await logAuditEvent(auth.userId, AuditAction.DEBRIEF_APPROVE, "showing_lead", leadId, {
      debrief_id: debrief.id,
      shower_id: debrief.shower_id,
      earning_id: earning.id,
      showing_fee: SHOWING_FEE,
      admin_notes: adminNotes || null,
    });

    return apiSuccess({
      approved: true,
      earning_id: earning.id,
      showing_fee: SHOWING_FEE,
      message: `$${SHOWING_FEE} showing fee approved for shower.`,
    });
  } catch (error) {
    console.error("Admin approve debrief error:", error);
    return apiError("Internal server error", 500);
  }
}
