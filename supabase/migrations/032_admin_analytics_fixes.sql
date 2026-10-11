-- 032: Admin analytics fixes from the 2026-10-11 admin audit.
--
-- 1. get_top_events counted microsite events as staycio.com events.
--    The microsite pages write into the same analytics_events table, tagged
--    with source_domain (022). Only /api/microsite-analytics sets that column,
--    so NULL means staycio.com. Unfiltered, the dashboard's "Top events" list
--    was mostly scroll_depth and cta_click from the building sites.
--
-- 2. One forged event could break /admin/microsites for every window.
--    get_microsite_stats cast properties->>'depth' to int and
--    properties->>'ms' to bigint unguarded, and /api/microsite-analytics
--    accepted any properties object, so a single {"depth":"x"} row made the
--    RPC throw 22P02 (or 22003 for an out-of-range number). The casts now only
--    run on plain digit strings short enough to fit; anything else counts as
--    0, as a missing value already did. The route validates these values too.
--
--    "Engaged" also counts the Stacy widget's call_click, chat_open and
--    chat_message: tapping to call or opening the chat is a person, and the
--    widget postdates 027.
--
-- Signatures, return columns, SECURITY DEFINER, search_path and grants are
-- unchanged. CREATE OR REPLACE keeps grants but resets search_path to what the
-- statement says (see 028 §4), so each keeps its SET clause, and the grants
-- are re-asserted anyway.

-- =========================
-- 1. get_top_events: staycio.com only
-- =========================
-- Body as in 007 plus the source_domain filter; search_path '' as pinned by 017.
create or replace function public.get_top_events(days_back int default 30, limit_count int default 20)
returns table (
  event_name text,
  event_category text,
  event_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    event_name,
    event_category,
    count(*) as event_count
  from public.analytics_events
  where created_at > now() - (days_back || ' days')::interval
    and source_domain is null
  group by event_name, event_category
  order by event_count desc
  limit limit_count;
$$;

revoke all on function public.get_top_events(int, int) from public, anon, authenticated;
grant execute on function public.get_top_events(int, int) to service_role;

-- =========================
-- 2. get_microsite_stats: guarded casts, Stacy events count as engaged
-- =========================
-- As in 027 except the `eng` CTE.
create or replace function public.get_microsite_stats(days_back int default 30)
returns table (
  domain text,
  views bigint,
  visitors bigint,
  leads bigint,
  form_starts bigint,
  engaged bigint,
  search_visitors bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with window_start as (
    select now() - make_interval(days => greatest(days_back, 1)) as ts
  ),
  pv as (
    select source_domain as domain,
           count(*) as views,
           count(distinct session_id) as visitors,
           count(distinct session_id) filter (
             where referrer ~* '(google|bing|yahoo|duckduckgo|ecosia|brave)\.'
           ) as search_visitors
    from public.page_views, window_start
    where source_domain is not null and created_at >= window_start.ts
    group by source_domain
  ),
  eng as (
    select source_domain as domain,
           count(distinct session_id) as engaged
    from public.analytics_events, window_start
    where source_domain is not null
      and created_at >= window_start.ts
      and (
        (event_name = 'scroll_depth' and coalesce(
          case when properties->>'depth' ~ '^[0-9]{1,9}$'
               then (properties->>'depth')::int end, 0) >= 50)
        or (event_name = 'time_on_page' and coalesce(
          case when properties->>'ms' ~ '^[0-9]{1,18}$'
               then (properties->>'ms')::bigint end, 0) >= 10000)
        or event_name in ('cta_click', 'form_start', 'call_click', 'chat_open', 'chat_message')
      )
    group by source_domain
  ),
  fs as (
    select source_domain as domain, count(*) as form_starts
    from public.analytics_events, window_start
    where source_domain is not null
      and event_name = 'form_start'
      and created_at >= window_start.ts
    group by source_domain
  ),
  ld as (
    select source_detail as domain, count(*) as leads
    from public.leads, window_start
    where source_detail is not null and created_at >= window_start.ts
    group by source_detail
  )
  select
    coalesce(pv.domain, ld.domain, fs.domain, eng.domain) as domain,
    coalesce(pv.views, 0) as views,
    coalesce(pv.visitors, 0) as visitors,
    coalesce(ld.leads, 0) as leads,
    coalesce(fs.form_starts, 0) as form_starts,
    coalesce(eng.engaged, 0) as engaged,
    coalesce(pv.search_visitors, 0) as search_visitors
  from pv
  full outer join ld on pv.domain = ld.domain
  full outer join fs on coalesce(pv.domain, ld.domain) = fs.domain
  full outer join eng on coalesce(pv.domain, ld.domain, fs.domain) = eng.domain
  order by 2 desc nulls last;
$$;

-- Admin surfaces call this with the service-role key; no public access.
revoke all on function public.get_microsite_stats(int) from public, anon, authenticated;
