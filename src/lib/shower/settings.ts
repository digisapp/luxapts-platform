import { createAdminClient } from "@/lib/supabase/server";

export type ShowerSettings = {
  showing_fee: number;
  placement_bonus_pct: number;
  mentorship_bonus: number;
  tier_premier: { min_showings: number; min_rating: number };
  tier_elite: { min_showings: number; min_rating: number };
  strike_policy: { max_strikes: number; window_days: number; late_cancel_hours: number };
  payout_timelines: { showing_fee_days: number; commission_dispute_days: number; placement_bonus_buffer_days: number };
  lead_feed: { default_expiry_hours: number; debrief_window_minutes: number; lease_attribution_days: number };
};

// Defaults — used if DB rows haven't been seeded yet
const DEFAULTS: ShowerSettings = {
  showing_fee: 150,
  placement_bonus_pct: 25,
  mentorship_bonus: 25,
  tier_premier: { min_showings: 15, min_rating: 4.7 },
  tier_elite: { min_showings: 50, min_rating: 4.9 },
  strike_policy: { max_strikes: 3, window_days: 90, late_cancel_hours: 2 },
  payout_timelines: { showing_fee_days: 7, commission_dispute_days: 7, placement_bonus_buffer_days: 100 },
  lead_feed: { default_expiry_hours: 24, debrief_window_minutes: 30, lease_attribution_days: 45 },
};

/**
 * Load all shower program settings from the database.
 * Falls back to hardcoded defaults if any key is missing.
 */
export async function getShowerSettings(): Promise<ShowerSettings> {
  try {
    const adminClient = createAdminClient();
    const { data } = await adminClient
      .from("platform_settings")
      .select("key, value")
      .in("key", [
        "shower_showing_fee",
        "shower_placement_bonus_pct",
        "shower_mentorship_bonus",
        "shower_tier_premier",
        "shower_tier_elite",
        "shower_strike_policy",
        "shower_payout_timelines",
        "shower_lead_feed",
      ]);

    const map = new Map((data || []).map((r) => [r.key, r.value]));

    return {
      showing_fee: Number(map.get("shower_showing_fee") ?? DEFAULTS.showing_fee),
      placement_bonus_pct: Number(map.get("shower_placement_bonus_pct") ?? DEFAULTS.placement_bonus_pct),
      mentorship_bonus: Number(map.get("shower_mentorship_bonus") ?? DEFAULTS.mentorship_bonus),
      tier_premier: (map.get("shower_tier_premier") as ShowerSettings["tier_premier"]) ?? DEFAULTS.tier_premier,
      tier_elite: (map.get("shower_tier_elite") as ShowerSettings["tier_elite"]) ?? DEFAULTS.tier_elite,
      strike_policy: (map.get("shower_strike_policy") as ShowerSettings["strike_policy"]) ?? DEFAULTS.strike_policy,
      payout_timelines: (map.get("shower_payout_timelines") as ShowerSettings["payout_timelines"]) ?? DEFAULTS.payout_timelines,
      lead_feed: (map.get("shower_lead_feed") as ShowerSettings["lead_feed"]) ?? DEFAULTS.lead_feed,
    };
  } catch {
    return DEFAULTS;
  }
}
