import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getShowerSettings } from "@/lib/shower/settings";
import { z } from "zod";

const commissionSchema = z.object({
  monthly_rent: z.number().positive(),
  // attribution: shower_id -> percentage (must sum to 100)
  attribution: z.record(z.string().uuid(), z.number().min(0.01).max(100)),
  notes: z.string().max(500).optional(),
});

// POST /api/admin/showing-leads/[id]/commission — record commission + release placement bonuses
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const { id: leadId } = await params;
    const rawBody = await req.json();
    const parsed = commissionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const { monthly_rent, attribution, notes } = parsed.data;

    // Validate attribution sums to 100
    const total = Object.values(attribution).reduce((s, v) => s + v, 0);
    if (Math.abs(total - 100) > 0.01) {
      return apiError("Attribution percentages must sum to 100", 400);
    }

    const commissionAmount = monthly_rent / 2; // standard half-month
    const adminClient = createAdminClient();
    const settings = await getShowerSettings();
    const PLACEMENT_BONUS_PCT = settings.placement_bonus_pct / 100;
    const DISPUTE_WINDOW_DAYS = settings.payout_timelines.commission_dispute_days;

    // Check for duplicate commission record
    const { data: existing } = await adminClient
      .from("commission_records")
      .select("id")
      .eq("showing_lead_id", leadId)
      .single();

    if (existing) {
      return apiError("Commission already recorded for this lead", 409);
    }

    // Record the commission
    const { data: commission, error: commError } = await adminClient
      .from("commission_records")
      .insert({
        showing_lead_id: leadId,
        monthly_rent,
        commission_amount: commissionAmount,
        attribution,
        recorded_by: auth.userId,
        notes: notes || null,
      })
      .select("id")
      .single();

    if (commError || !commission) {
      console.error("Commission record error:", commError);
      return apiError("Failed to record commission", 500);
    }

    // Mark lead as having a signed lease
    await adminClient
      .from("showing_leads")
      .update({
        lease_signed: true,
        lease_signed_at: new Date().toISOString(),
        monthly_rent,
      })
      .eq("id", leadId);

    // Create placement bonus earnings (pending, releasing after dispute window)
    const estimatedPayDate = new Date();
    estimatedPayDate.setDate(estimatedPayDate.getDate() + DISPUTE_WINDOW_DAYS);

    const bonusInserts = Object.entries(attribution).map(([showerId, pct]) => {
      const showerBonus = commissionAmount * PLACEMENT_BONUS_PCT * (pct / 100);
      return {
        shower_id: showerId,
        showing_lead_id: leadId,
        type: "placement_bonus" as const,
        amount: Math.round(showerBonus * 100) / 100,
        status: "pending" as const,
        description: `Placement bonus — ${pct}% attribution (${monthly_rent}/mo rent)`,
        monthly_rent,
        brokerage_commission: commissionAmount,
        estimated_pay_date: estimatedPayDate.toISOString().split("T")[0],
      };
    });

    const { error: bonusError } = await adminClient
      .from("shower_earnings")
      .insert(bonusInserts);

    if (bonusError) {
      console.error("Create placement bonus error:", bonusError);
      // Don't fail — commission recorded but bonuses need manual creation
    }

    const bonusDetails = Object.entries(attribution).map(([showerId, pct]) => ({
      shower_id: showerId,
      pct,
      bonus_amount: Math.round(commissionAmount * PLACEMENT_BONUS_PCT * (pct / 100) * 100) / 100,
    }));

    return apiSuccess({
      commission_id: commission.id,
      commission_amount: commissionAmount,
      placement_bonuses: bonusError ? [] : bonusDetails,
      estimated_pay_date: estimatedPayDate.toISOString().split("T")[0],
      bonuses_created: !bonusError,
      message: bonusError
        ? `Commission of $${commissionAmount.toFixed(2)} recorded. WARNING: Placement bonuses failed to create — please add them manually.`
        : `Commission of $${commissionAmount.toFixed(2)} recorded. Placement bonuses created pending ${DISPUTE_WINDOW_DAYS}-day review window.`,
    }, 201);
  } catch (error) {
    console.error("Admin record commission error:", error);
    return apiError("Internal server error", 500);
  }
}
