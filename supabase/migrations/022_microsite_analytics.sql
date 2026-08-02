-- 022: Microsite analytics
-- Tracks traffic on the standalone building microsites (namdartowers.com,
-- downtown6miami.com, …) inside the platform's existing analytics tables,
-- tagged by originating domain so each site can be reported on separately.
--
-- Pairs with migration 021 (leads.source_detail), which already stores the
-- originating domain for microsite leads — the same values are used here so
-- traffic and conversions join on one key.

alter table public.page_views add column if not exists source_domain text;
create index if not exists page_views_source_domain_idx
  on public.page_views(source_domain)
  where source_domain is not null;

alter table public.analytics_events add column if not exists source_domain text;
create index if not exists analytics_events_source_domain_idx
  on public.analytics_events(source_domain)
  where source_domain is not null;

-- Aggregate traffic + conversions per microsite domain. Aggregating in SQL
-- avoids PostgREST's 1000-row response cap on large view tables.
create or replace function public.get_microsite_stats(days_back int default 30)
returns table (
  domain text,
  views bigint,
  visitors bigint,
  leads bigint,
  form_starts bigint
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
           count(distinct session_id) as visitors
    from public.page_views, window_start
    where source_domain is not null and created_at >= window_start.ts
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
    coalesce(pv.domain, ld.domain, fs.domain) as domain,
    coalesce(pv.views, 0) as views,
    coalesce(pv.visitors, 0) as visitors,
    coalesce(ld.leads, 0) as leads,
    coalesce(fs.form_starts, 0) as form_starts
  from pv
  full outer join ld on pv.domain = ld.domain
  full outer join fs on coalesce(pv.domain, ld.domain) = fs.domain
  order by 2 desc nulls last;
$$;

-- Admin surfaces call this with the service-role key; no public access.
revoke all on function public.get_microsite_stats(int) from public, anon, authenticated;
