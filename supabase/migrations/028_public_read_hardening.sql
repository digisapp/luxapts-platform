-- 028: close what the 2026-09-23 audit found still readable with the public key.

-- =========================
-- 1. Analytics RPCs were still callable by anon
-- =========================
-- 017 revoked EXECUTE from anon/authenticated, but Postgres grants EXECUTE on
-- new functions to PUBLIC, which anon inherits — so get_visitor_stats and
-- get_top_events answered the publishable key, and anyone could inflate
-- page-view counts with increment_session_page_views. All three are only
-- called with the service role (api/admin/analytics, api/analytics/track).
revoke all on function public.get_visitor_stats(int) from public, anon, authenticated;
revoke all on function public.get_top_events(int, int) from public, anon, authenticated;
revoke all on function public.increment_session_page_views(text) from public, anon, authenticated;
grant execute on function public.get_visitor_stats(int) to service_role;
grant execute on function public.get_top_events(int, int) to service_role;
grant execute on function public.increment_session_page_views(text) to service_role;

-- =========================
-- 2. Hidden inventory was still public
-- =========================
-- Hiding the 2,778 fabricated units (and deactivating seed/duplicate
-- buildings) only flipped flags; units_public_read / snapshots_public_read
-- were `using (true)`, so every fake unit and rent stayed readable through
-- PostgREST. The app reads inventory with the service role only, so public
-- reads can be limited to what the site actually lists.
drop policy if exists "units_public_read" on public.units;
create policy "units_public_read" on public.units for select using (
  is_available
  and exists (
    select 1 from public.buildings b
    where b.id = units.building_id and b.status = 'active'
  )
);

drop policy if exists "snapshots_public_read" on public.unit_price_snapshots;
create policy "snapshots_public_read" on public.unit_price_snapshots for select using (
  exists (
    select 1 from public.units u
    join public.buildings b on b.id = u.building_id
    where u.id = unit_price_snapshots.unit_id
      and u.is_available
      and b.status = 'active'
  )
);

-- =========================
-- 3. Admin analytics views
-- =========================
-- security_invoker already returns nothing useful to anon, but the views
-- have no public purpose.
revoke select on public.building_popularity from anon, authenticated;
revoke select on public.daily_metrics from anon, authenticated;
revoke select on public.search_analytics from anon, authenticated;

-- =========================
-- 4. Pinned search_path (Supabase advisor: function_search_path_mutable)
-- =========================
-- 024 re-created check_shower_strikes (SECURITY DEFINER) with CREATE OR
-- REPLACE, which dropped the search_path 017 had pinned. Every body below
-- already schema-qualifies its tables.
alter function public.check_shower_strikes() set search_path = '';
alter function public.seo_slugify(text) set search_path = '';
alter function public.buildings_set_slug() set search_path = '';
