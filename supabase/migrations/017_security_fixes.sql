-- =========================
-- Migration 017: Security Fixes (audit 2026-06-11)
-- Idempotent — safe to run on any state, including a DB where 014
-- previously failed and rolled back (duplicate policy name).
-- =========================

-- =========================
-- 1. CRITICAL: prevent self-signup as admin
-- raw_user_meta_data is client-controlled — anyone could sign up with
-- options.data.role = 'admin'. Always create profiles as 'renter';
-- promote roles only via service-role tooling.
-- =========================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'renter',
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

-- =========================
-- 2. CRITICAL: showers could insert/update their own row with any values
-- (status='approved', tier='elite', fake stats) via direct PostgREST.
-- Registration and profile updates go through service-role API routes,
-- so anon/authenticated write policies are unnecessary.
-- =========================
drop policy if exists "showers_insert_own" on public.showers;
drop policy if exists "showers_update_own" on public.showers;

-- Same for certifications: quiz grading is server-side
-- (/api/shower/certifications/[buildingId]/quiz uses the service role).
drop policy if exists "shower_certs_insert_own" on public.shower_certifications;
drop policy if exists "shower_certs_update_own" on public.shower_certifications;

-- Claims: business rules (lead open, shower certified) are enforced in
-- /api/shower/leads/[id]/claim via service role — direct writes bypass them.
drop policy if exists "showing_claims_shower_insert" on public.showing_claims;
drop policy if exists "showing_claims_shower_update" on public.showing_claims;

-- Debriefs: prevent pre-approved/pre-rated inserts via direct PostgREST.
drop policy if exists "showing_debriefs_shower_insert" on public.showing_debriefs;
create policy "showing_debriefs_shower_insert"
  on public.showing_debriefs for insert
  with check (
    shower_id = public.get_shower_id()
    and admin_approved_at is null
    and admin_approved_by is null
    and client_rating is null
  );

-- =========================
-- 3. HIGH: anyone could update any visitor session (forge attribution).
-- Session writes go through /api/analytics/track (service role) now.
-- =========================
drop policy if exists "user_sessions_public_update" on public.user_sessions;
drop policy if exists "user_sessions_public_insert" on public.user_sessions;

-- Analytics inserts: previously `with check (true)` — spoofable user_id and
-- unlimited spam via the anon key. All inserts now go through the track route.
drop policy if exists "page_views_public_insert" on public.page_views;
drop policy if exists "building_views_public_insert" on public.building_views;
drop policy if exists "analytics_events_public_insert" on public.analytics_events;
drop policy if exists "search_events_insert" on public.search_events;

-- =========================
-- 4. MEDIUM: pin search_path on SECURITY DEFINER functions
-- =========================
alter function public.is_admin() set search_path = '';
alter function public.get_user_role() set search_path = '';
alter function public.is_shower() set search_path = '';
alter function public.get_shower_id() set search_path = '';
alter function public.update_shower_stats() set search_path = '';
alter function public.check_shower_strikes() set search_path = '';
alter function public.increment_session_page_views(text) set search_path = '';
alter function public.get_visitor_stats(int) set search_path = '';
alter function public.get_top_events(int, int) set search_path = '';

-- Analytics functions should not be callable with the anon key
-- (they are invoked via the service role in /api/admin/analytics).
revoke execute on function public.get_visitor_stats(int) from anon, authenticated;
revoke execute on function public.get_top_events(int, int) from anon, authenticated;
revoke execute on function public.increment_session_page_views(text) from anon, authenticated;

-- =========================
-- 5. MEDIUM: views over admin-only tables bypassed RLS (owner-rights views)
-- =========================
alter view public.daily_metrics set (security_invoker = true);
alter view public.building_popularity set (security_invoker = true);
alter view public.search_analytics set (security_invoker = true);
alter view public.units_with_latest_price set (security_invoker = true);

-- =========================
-- 6. HIGH: schema drift — columns the app code references but never existed
-- =========================
-- partner auth selects contact_name/contact_email/contact_phone; without
-- these columns every /api/partner/* request 403s.
alter table public.partners
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

-- neighborhoods/[slug] page selects description; missing column = 42703
-- error = every neighborhood page 404s.
alter table public.neighborhoods
  add column if not exists description text;

-- =========================
-- 7. HIGH: units upsert uses onConflict (building_id, unit_number) but no
-- matching unique constraint exists — imports fail with 42P10.
-- Dedupe first (keep the most recently updated row), then add the index.
-- =========================
delete from public.units u
using public.units dup
where u.building_id = dup.building_id
  and u.unit_number = dup.unit_number
  and u.unit_number is not null
  and u.ctid < dup.ctid;

create unique index if not exists units_building_unit_number_uidx
  on public.units(building_id, unit_number)
  where unit_number is not null;

-- =========================
-- 8. Re-apply the important parts of 014 in case it previously rolled back
-- (CREATE POLICY duplicate-name failure aborted the whole transaction).
-- =========================
drop policy if exists "leads_agent_update_assigned" on public.leads;
create policy "leads_agent_update_assigned"
  on public.leads for update
  using (
    exists (
      select 1 from public.agent_assignments aa
      where aa.lead_id = leads.id
        and aa.agent_user_id = auth.uid()
        and aa.status in ('assigned', 'accepted')
    )
  )
  with check (
    exists (
      select 1 from public.agent_assignments aa
      where aa.lead_id = leads.id
        and aa.agent_user_id = auth.uid()
        and aa.status in ('assigned', 'accepted')
    )
  );

alter table public.email_campaigns
  add column if not exists sent_count integer not null default 0,
  add column if not exists failed_count integer not null default 0,
  add column if not exists status text not null default 'completed';

-- Ensure the status CHECK includes 'failed' (used when every batch fails)
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public'
      and table_name = 'email_campaigns'
      and constraint_name = 'email_campaigns_status_check'
  ) then
    alter table public.email_campaigns drop constraint email_campaigns_status_check;
  end if;
  alter table public.email_campaigns
    add constraint email_campaigns_status_check
    check (status in ('pending', 'sending', 'completed', 'partial_failure', 'failed'));
end $$;

create index if not exists idx_unit_price_snapshots_rent
  on public.unit_price_snapshots(rent);
create index if not exists idx_showers_status_tier
  on public.showers(status, tier);
create index if not exists idx_emails_ai_confidence
  on public.emails(ai_confidence)
  where ai_confidence is not null;
create index if not exists idx_shower_earnings_type
  on public.shower_earnings(type, status);
create index if not exists idx_showing_debriefs_pending_approval
  on public.showing_debriefs(admin_approved_at)
  where admin_approved_at is null;
create index if not exists idx_shadow_sessions_lead_shower
  on public.shadow_sessions(lead_shower_id, confirmed_at);
create index if not exists idx_email_campaigns_status
  on public.email_campaigns(status)
  where status != 'completed';

-- =========================
-- 9. LOW: stale agent assignments retained read access to targets/events
-- =========================
drop policy if exists "lead_targets_agent_read_assigned" on public.lead_targets;
create policy "lead_targets_agent_read_assigned"
  on public.lead_targets for select
  using (
    exists (
      select 1 from public.agent_assignments aa
      where aa.lead_id = lead_targets.lead_id
        and aa.agent_user_id = auth.uid()
        and aa.status in ('assigned', 'accepted')
    )
  );

drop policy if exists "lead_events_agent_read_assigned" on public.lead_events;
create policy "lead_events_agent_read_assigned"
  on public.lead_events for select
  using (
    exists (
      select 1 from public.agent_assignments aa
      where aa.lead_id = lead_events.lead_id
        and aa.agent_user_id = auth.uid()
        and aa.status in ('assigned', 'accepted')
    )
  );

-- =========================
-- 10. LOW: scrape status exposed error messages/internal URLs publicly
-- =========================
drop policy if exists "Anyone can view scrape status" on public.building_scrape_status;
drop policy if exists "scrape_status_admin_read" on public.building_scrape_status;
create policy "scrape_status_admin_read"
  on public.building_scrape_status for select
  using (public.is_admin());

-- =========================
-- 11. Hot foreign-key indexes flagged by the audit
-- =========================
create index if not exists idx_units_floorplan_id on public.units(floorplan_id);
create index if not exists idx_lead_targets_building_id on public.lead_targets(building_id);
create index if not exists idx_lead_targets_unit_id on public.lead_targets(unit_id);
create index if not exists idx_chat_sessions_lead_id on public.chat_sessions(lead_id);
create index if not exists idx_chat_sessions_building_id on public.chat_sessions(building_id);
create index if not exists idx_agents_city_id on public.agents(city_id);
create index if not exists idx_shower_earnings_showing_lead_id on public.shower_earnings(showing_lead_id);
create index if not exists idx_commission_records_showing_lead_id on public.commission_records(showing_lead_id);
create index if not exists idx_shower_strikes_showing_lead_id on public.shower_strikes(showing_lead_id);
create index if not exists idx_emails_sent_by on public.emails(sent_by);
create index if not exists idx_page_views_user_id on public.page_views(user_id);
create index if not exists idx_building_views_user_id on public.building_views(user_id);
create index if not exists idx_analytics_events_user_id on public.analytics_events(user_id);
