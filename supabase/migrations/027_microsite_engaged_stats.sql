-- 027: Microsite stats that a human can act on.
--
-- get_microsite_stats counted every page_views row as a visitor. On a freshly
-- certificated domain most of those rows are scanners with browser user
-- agents: one view per session, no referrer, no scroll, no time on page. In
-- the 30 days after the second wave launched, each new site showed 60–78
-- "visitors" and 0 leads, which read as a conversion problem. It was not —
-- the honest count of engaged humans on those pages was 2–8, and the three
-- sites with real search traffic were converting at 8–34% of engaged sessions.
--
-- Two columns are added:
--   engaged          distinct sessions that scrolled past half the page, stayed
--                    10+ seconds, clicked a CTA, or started the form
--   search_visitors  distinct sessions that arrived from a search engine
-- Conversion rate on the admin page is now leads / engaged.
--
-- Postgres cannot change a function's return type in place, hence the drop.

drop function if exists public.get_microsite_stats(int);

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
        (event_name = 'scroll_depth' and coalesce((properties->>'depth')::int, 0) >= 50)
        or (event_name = 'time_on_page' and coalesce((properties->>'ms')::bigint, 0) >= 10000)
        or event_name in ('cta_click', 'form_start')
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
