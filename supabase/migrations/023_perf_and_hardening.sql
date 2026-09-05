-- 023: Performance + hardening fixes from the 2026-08 full-stack audit.
-- Idempotent; safe to re-run.
--
-- 1. Capture schema drift (columns referenced by code but missing from migrations)
-- 2. latest_unit_prices view — bounded "latest price per unit" for all read paths
-- 3. Missing indexes on hot query paths
-- 4. showing_leads RLS: stop exposing client PII on open leads to all showers
-- 5. get_recent_price_drops RPC — server-side drop detection (no 1000-row cap)
-- 6. cleanup_old_data RPC — retention for snapshots + analytics/log tables
-- 7. updated_at coverage for scraper-mutated tables
-- 8. leads contactability check

-- ============================================================
-- 1. Schema drift: buildings.slug / hero_image_url are selected by
--    src/app/api/search/semantic + admin data-quality but exist in no
--    migration. Capture them so migrations describe production again.
-- ============================================================
alter table public.buildings add column if not exists slug text;
alter table public.buildings add column if not exists hero_image_url text;

-- ============================================================
-- 2. Latest price per unit. unit_price_snapshots grows daily; every
--    consumer previously fetched FULL history ordered desc and kept the
--    first row per unit in JS — silently truncated at PostgREST's 1000-row
--    cap, which dropped units from search as history accumulated.
--    DISTINCT ON rides the (unit_id, captured_at desc) index from 001.
-- ============================================================
create or replace view public.latest_unit_prices as
select distinct on (unit_id)
  unit_id,
  rent,
  net_effective_rent,
  lease_term_months,
  captured_at
from public.unit_price_snapshots
order by unit_id, captured_at desc;

alter view public.latest_unit_prices set (security_invoker = true);

-- ============================================================
-- 3. Missing indexes (cross-referenced against actual query filters)
-- ============================================================
-- price-drop cron scans by time window; only (unit_id, captured_at) existed
create index if not exists unit_price_snapshots_captured_at_idx
  on public.unit_price_snapshots (captured_at desc);

-- main search: available units by building + beds range
create index if not exists units_building_beds_avail_idx
  on public.units (building_id, beds) where is_available;

-- move-in date filter
create index if not exists units_available_on_idx
  on public.units (available_on) where is_available;

-- inbound-email lead matching (webhooks/resend)
create index if not exists leads_user_email_idx
  on public.leads (user_email);

-- open shower-lead feed (.eq status + expires_at bound)
create index if not exists showing_leads_open_expires_idx
  on public.showing_leads (expires_at) where status = 'open';

-- reverse amenity lookup / FK cascade (PK only covers building_id prefix)
create index if not exists building_amenities_amenity_id_idx
  on public.building_amenities (amenity_id);

-- neighborhoods/[slug] looks up by slug alone; unique(city_id, slug) can't serve it
create index if not exists neighborhoods_slug_idx
  on public.neighborhoods (slug);

-- browse/search pair these constantly
create index if not exists buildings_city_status_idx
  on public.buildings (city_id, status);

-- importer identity lookups (.eq name within a city). Plain index, not
-- unique: production may already hold duplicate names — dedupe before
-- promoting this to a unique constraint.
create index if not exists buildings_city_name_idx
  on public.buildings (city_id, name);

-- ============================================================
-- 4. showing_leads RLS. The old policy let ANY approved shower select
--    open leads — including client_name/email/phone — via the anon key,
--    enabling direct contact that bypasses claiming and fee attribution.
--    The app never uses that path (the shower feed goes through
--    /api/shower/leads with the service role and strips client fields
--    from open leads), so restrict row access to claimed leads + admins.
-- ============================================================
drop policy if exists "showing_leads_shower_read_open" on public.showing_leads;

create policy "showing_leads_shower_read_claimed"
  on public.showing_leads for select
  using (
    exists (
      select 1 from public.showing_claims sc
      where sc.showing_lead_id = id
        and sc.shower_id = public.get_shower_id()
    )
    or public.is_admin()
  );

-- ============================================================
-- 5. Price-drop detection in SQL. Replaces the cron's two uncapped
--    client-side scans (both silently truncated at 1000 rows).
-- ============================================================
create or replace function public.get_recent_price_drops(p_since timestamptz)
returns table (unit_id uuid, old_rent numeric, new_rent numeric, captured_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with latest as (
    select distinct on (ups.unit_id) ups.unit_id, ups.rent, ups.captured_at
    from public.unit_price_snapshots ups
    order by ups.unit_id, ups.captured_at desc
  ),
  prior as (
    select distinct on (ups.unit_id) ups.unit_id, ups.rent
    from public.unit_price_snapshots ups
    join latest l on l.unit_id = ups.unit_id and ups.captured_at < l.captured_at
    order by ups.unit_id, ups.captured_at desc
  )
  select l.unit_id, p.rent, l.rent, l.captured_at
  from latest l
  join prior p on p.unit_id = l.unit_id
  where l.captured_at >= p_since
    and l.rent < p.rent;
$$;

revoke execute on function public.get_recent_price_drops(timestamptz) from public, anon, authenticated;
grant execute on function public.get_recent_price_drops(timestamptz) to service_role;

-- ============================================================
-- 6. Retention. Snapshots: keep the last 180 days plus every unit's
--    latest row (so latest_unit_prices never loses a unit). Analytics
--    and log tables: unbounded growth with no reader past 90 days.
-- ============================================================
create or replace function public.cleanup_old_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshots bigint;
  v_page_views bigint;
  v_events bigint;
  v_building_views bigint;
  v_scrape_jobs bigint;
begin
  delete from public.unit_price_snapshots ups
  where ups.captured_at < now() - interval '180 days'
    and exists (
      select 1 from public.unit_price_snapshots newer
      where newer.unit_id = ups.unit_id
        and newer.captured_at > ups.captured_at
    );
  get diagnostics v_snapshots = row_count;

  delete from public.page_views where created_at < now() - interval '180 days';
  get diagnostics v_page_views = row_count;

  delete from public.analytics_events where created_at < now() - interval '180 days';
  get diagnostics v_events = row_count;

  delete from public.building_views where created_at < now() - interval '180 days';
  get diagnostics v_building_views = row_count;

  delete from public.scrape_jobs where created_at < now() - interval '90 days';
  get diagnostics v_scrape_jobs = row_count;

  return jsonb_build_object(
    'price_snapshots', v_snapshots,
    'page_views', v_page_views,
    'analytics_events', v_events,
    'building_views', v_building_views,
    'scrape_jobs', v_scrape_jobs
  );
end;
$$;

revoke execute on function public.cleanup_old_data() from public, anon, authenticated;
grant execute on function public.cleanup_old_data() to service_role;

-- ============================================================
-- 7. updated_at coverage. The scraper mutates units/buildings daily with
--    no record of when a row last changed. Reuse set_updated_at from 012.
-- ============================================================
alter table public.units add column if not exists updated_at timestamptz not null default now();
alter table public.buildings add column if not exists updated_at timestamptz not null default now();

drop trigger if exists units_updated_at on public.units;
create trigger units_updated_at
  before update on public.units
  for each row execute procedure public.set_updated_at();

drop trigger if exists buildings_updated_at on public.buildings;
create trigger buildings_updated_at
  before update on public.buildings
  for each row execute procedure public.set_updated_at();

-- tables that already have updated_at but never had the trigger
drop trigger if exists building_facts_updated_at on public.building_facts;
create trigger building_facts_updated_at
  before update on public.building_facts
  for each row execute procedure public.set_updated_at();

drop trigger if exists chat_sessions_updated_at on public.chat_sessions;
create trigger chat_sessions_updated_at
  before update on public.chat_sessions
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 8. Leads must be contactable. NOT VALID so existing rows can't fail
--    the migration; validate manually after cleaning any offenders.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_contactable_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_contactable_check
      check (user_email is not null or user_phone is not null)
      not valid;
  end if;
end;
$$;
