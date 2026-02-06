-- =========================
-- Enhanced Analytics Tables
-- =========================

-- Page views - track all page visits
create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  path text not null,
  referrer text,
  user_agent text,
  device_type text check (device_type in ('desktop', 'tablet', 'mobile')),
  city_slug text,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index if not exists page_views_session_id_idx on public.page_views(session_id);
create index if not exists page_views_created_at_idx on public.page_views(created_at desc);
create index if not exists page_views_path_idx on public.page_views(path);

-- Building views - detailed tracking when users view building details
create table if not exists public.building_views (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  building_id uuid not null references public.buildings(id) on delete cascade,
  source text, -- 'search', 'map', 'favorites', 'similar', 'direct'
  time_on_page_ms int,
  scrolled_to_bottom boolean default false,
  viewed_gallery boolean default false,
  clicked_contact boolean default false,
  clicked_schedule_tour boolean default false,
  created_at timestamptz not null default now()
);

create index if not exists building_views_building_id_idx on public.building_views(building_id);
create index if not exists building_views_session_id_idx on public.building_views(session_id);
create index if not exists building_views_created_at_idx on public.building_views(created_at desc);

-- Analytics events - generic event tracking for custom events
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  event_category text, -- 'engagement', 'conversion', 'navigation', 'error'
  properties jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_event_name_idx on public.analytics_events(event_name);
create index if not exists analytics_events_session_id_idx on public.analytics_events(session_id);
create index if not exists analytics_events_created_at_idx on public.analytics_events(created_at desc);
create index if not exists analytics_events_category_idx on public.analytics_events(event_category);

-- User sessions - track unique visitor sessions
create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  page_views_count int not null default 1,
  device_type text,
  browser text,
  os text,
  country text,
  city text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_page text,
  is_bounce boolean default true
);

create index if not exists user_sessions_user_id_idx on public.user_sessions(user_id);
create index if not exists user_sessions_first_seen_at_idx on public.user_sessions(first_seen_at desc);

-- Add indexes to existing search_events for better querying
create index if not exists search_events_session_id_idx on public.search_events(session_id);
create index if not exists search_events_city_slug_idx on public.search_events(city_slug);

-- =========================
-- RLS Policies for Analytics
-- =========================

-- Page views: public insert, admin read
alter table public.page_views enable row level security;

create policy "page_views_public_insert" on public.page_views
  for insert with check (true);

create policy "page_views_admin_read" on public.page_views
  for select using (public.is_admin());

-- Building views: public insert, admin read
alter table public.building_views enable row level security;

create policy "building_views_public_insert" on public.building_views
  for insert with check (true);

create policy "building_views_admin_read" on public.building_views
  for select using (public.is_admin());

-- Analytics events: public insert, admin read
alter table public.analytics_events enable row level security;

create policy "analytics_events_public_insert" on public.analytics_events
  for insert with check (true);

create policy "analytics_events_admin_read" on public.analytics_events
  for select using (public.is_admin());

-- User sessions: public insert/update (own session), admin read
alter table public.user_sessions enable row level security;

create policy "user_sessions_public_insert" on public.user_sessions
  for insert with check (true);

create policy "user_sessions_public_update" on public.user_sessions
  for update using (true);

create policy "user_sessions_admin_read" on public.user_sessions
  for select using (public.is_admin());

-- =========================
-- Analytics Helper Views
-- =========================

-- Daily metrics summary view
create or replace view public.daily_metrics as
select
  date_trunc('day', created_at)::date as date,
  count(distinct session_id) as unique_visitors,
  count(*) as total_page_views,
  round(count(*)::numeric / nullif(count(distinct session_id), 0), 2) as pages_per_session
from public.page_views
where created_at > now() - interval '90 days'
group by date_trunc('day', created_at)::date
order by date desc;

-- Building popularity view
create or replace view public.building_popularity as
select
  b.id as building_id,
  b.name as building_name,
  n.name as neighborhood,
  c.name as city,
  count(distinct bv.session_id) as unique_views,
  count(bv.id) as total_views,
  sum(case when bv.clicked_contact then 1 else 0 end) as contact_clicks,
  sum(case when bv.clicked_schedule_tour then 1 else 0 end) as tour_clicks,
  round(
    sum(case when bv.clicked_contact or bv.clicked_schedule_tour then 1 else 0 end)::numeric
    / nullif(count(distinct bv.session_id), 0) * 100, 2
  ) as conversion_rate
from public.buildings b
left join public.building_views bv on bv.building_id = b.id
left join public.neighborhoods n on n.id = b.neighborhood_id
left join public.cities c on c.id = b.city_id
where bv.created_at > now() - interval '30 days' or bv.created_at is null
group by b.id, b.name, n.name, c.name
order by total_views desc nulls last;

-- Search analytics view
create or replace view public.search_analytics as
select
  date_trunc('day', created_at)::date as date,
  city_slug,
  count(*) as search_count,
  avg(results_count)::int as avg_results,
  avg(response_time_ms)::int as avg_response_time_ms
from public.search_events
where created_at > now() - interval '30 days'
group by date_trunc('day', created_at)::date, city_slug
order by date desc, search_count desc;

-- =========================
-- Helper Functions
-- =========================

-- Function to increment session page views
create or replace function public.increment_session_page_views(p_session_id text)
returns void
language plpgsql
security definer
as $$
begin
  update public.user_sessions
  set
    page_views_count = page_views_count + 1,
    last_seen_at = now(),
    is_bounce = false
  where session_id = p_session_id;
end;
$$;

-- Function to get daily visitor stats
create or replace function public.get_visitor_stats(days_back int default 30)
returns table (
  date date,
  unique_visitors bigint,
  total_page_views bigint,
  pages_per_session numeric,
  bounce_rate numeric
)
language sql
stable
security definer
as $$
  select
    date_trunc('day', us.first_seen_at)::date as date,
    count(distinct us.session_id) as unique_visitors,
    sum(us.page_views_count) as total_page_views,
    round(avg(us.page_views_count)::numeric, 2) as pages_per_session,
    round(
      (count(case when us.is_bounce then 1 end)::numeric / nullif(count(*), 0)) * 100, 2
    ) as bounce_rate
  from public.user_sessions us
  where us.first_seen_at > now() - (days_back || ' days')::interval
  group by date_trunc('day', us.first_seen_at)::date
  order by date desc;
$$;

-- Function to get top events
create or replace function public.get_top_events(days_back int default 30, limit_count int default 20)
returns table (
  event_name text,
  event_category text,
  event_count bigint
)
language sql
stable
security definer
as $$
  select
    event_name,
    event_category,
    count(*) as event_count
  from public.analytics_events
  where created_at > now() - (days_back || ' days')::interval
  group by event_name, event_category
  order by event_count desc
  limit limit_count;
$$;
