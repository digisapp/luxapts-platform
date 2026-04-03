-- =========================
-- Shower Program Settings
-- Stored in platform_settings as JSON objects
-- All payout rules, tier thresholds, and policy settings
-- are editable by admin without a code deploy.
-- =========================

-- Payout rules
INSERT INTO public.platform_settings (key, value) VALUES
  ('shower_showing_fee',        '150'::jsonb),
  ('shower_placement_bonus_pct', '25'::jsonb),
  ('shower_mentorship_bonus',   '25'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Tier thresholds
INSERT INTO public.platform_settings (key, value) VALUES
  ('shower_tier_premier', '{"min_showings": 15, "min_rating": 4.7}'::jsonb),
  ('shower_tier_elite',   '{"min_showings": 50, "min_rating": 4.9}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Strike policy
INSERT INTO public.platform_settings (key, value) VALUES
  ('shower_strike_policy', '{"max_strikes": 3, "window_days": 90, "late_cancel_hours": 2}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Payout timelines
INSERT INTO public.platform_settings (key, value) VALUES
  ('shower_payout_timelines', '{"showing_fee_days": 7, "commission_dispute_days": 7, "placement_bonus_buffer_days": 100}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Lead feed rules
INSERT INTO public.platform_settings (key, value) VALUES
  ('shower_lead_feed', '{"default_expiry_hours": 24, "debrief_window_minutes": 30, "lease_attribution_days": 45}'::jsonb)
ON CONFLICT (key) DO NOTHING;
