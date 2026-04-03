import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getShowerSettings } from "@/lib/shower/settings";
import { z } from "zod";

// GET /api/admin/shower-settings
export async function GET() {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);
    const settings = await getShowerSettings();
    return apiSuccess({ settings });
  } catch (error) {
    console.error("Get shower settings error:", error);
    return apiError("Internal server error", 500);
  }
}

const updateSchema = z.object({
  showing_fee: z.number().positive().max(10000).optional(),
  placement_bonus_pct: z.number().min(0).max(100).optional(),
  mentorship_bonus: z.number().min(0).max(500).optional(),
  tier_premier: z.object({
    min_showings: z.number().int().min(1),
    min_rating: z.number().min(1).max(5),
  }).optional(),
  tier_elite: z.object({
    min_showings: z.number().int().min(1),
    min_rating: z.number().min(1).max(5),
  }).optional(),
  strike_policy: z.object({
    max_strikes: z.number().int().min(1).max(20),
    window_days: z.number().int().min(1).max(365),
    late_cancel_hours: z.number().min(0).max(48),
  }).optional(),
  payout_timelines: z.object({
    showing_fee_days: z.number().int().min(1).max(30),
    commission_dispute_days: z.number().int().min(1).max(30),
    placement_bonus_buffer_days: z.number().int().min(1).max(180),
  }).optional(),
  lead_feed: z.object({
    default_expiry_hours: z.number().int().min(1).max(168),
    debrief_window_minutes: z.number().int().min(5).max(240),
    lease_attribution_days: z.number().int().min(1).max(90),
  }).optional(),
});

// PUT /api/admin/shower-settings
export async function PUT(req: Request) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) return apiError(auth.error, auth.status);

    const rawBody = await req.json();
    const parsed = updateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const body = parsed.data;
    const adminClient = createAdminClient();

    // Build upsert rows for each setting that was sent
    const rows: Array<{ key: string; value: unknown; updated_at: string }> = [];
    const now = new Date().toISOString();

    if (body.showing_fee !== undefined)
      rows.push({ key: "shower_showing_fee", value: body.showing_fee, updated_at: now });
    if (body.placement_bonus_pct !== undefined)
      rows.push({ key: "shower_placement_bonus_pct", value: body.placement_bonus_pct, updated_at: now });
    if (body.mentorship_bonus !== undefined)
      rows.push({ key: "shower_mentorship_bonus", value: body.mentorship_bonus, updated_at: now });
    if (body.tier_premier !== undefined)
      rows.push({ key: "shower_tier_premier", value: body.tier_premier, updated_at: now });
    if (body.tier_elite !== undefined)
      rows.push({ key: "shower_tier_elite", value: body.tier_elite, updated_at: now });
    if (body.strike_policy !== undefined)
      rows.push({ key: "shower_strike_policy", value: body.strike_policy, updated_at: now });
    if (body.payout_timelines !== undefined)
      rows.push({ key: "shower_payout_timelines", value: body.payout_timelines, updated_at: now });
    if (body.lead_feed !== undefined)
      rows.push({ key: "shower_lead_feed", value: body.lead_feed, updated_at: now });

    if (rows.length === 0) return apiError("No settings provided");

    const { error } = await adminClient
      .from("platform_settings")
      .upsert(rows, { onConflict: "key" });

    if (error) {
      console.error("Update shower settings error:", error);
      return apiError("Failed to save settings", 500);
    }

    const updated = await getShowerSettings();
    return apiSuccess({ settings: updated });
  } catch (error) {
    console.error("Update shower settings error:", error);
    return apiError("Internal server error", 500);
  }
}
