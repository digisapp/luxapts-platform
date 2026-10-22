-- =========================
-- Migration 039: where staycio.com leads come from + AI crawler visits
-- Idempotent — safe to run more than once.
--
-- 1. leads.session_id / referral_source / referral_detail / landing_page.
--    The site forms now send their analytics session id with the lead, and
--    /api/leads resolves it against user_sessions + page_views into a source
--    ("chatgpt", "google", "direct", …). Until now a lead carried only the
--    form it came through, so tying a lead to ChatGPT meant matching
--    timestamps by hand.
-- 2. crawler_hits: one row per page request from an AI assistant's crawler
--    (OpenAI, Perplexity, Anthropic) or Bingbot, written by src/proxy.ts.
--    ChatGPT-User rows are ChatGPT reading a page while answering someone,
--    the earliest sign a building is being recommended. Service-role writes
--    only; admins read.
--
-- Apply BEFORE deploying the code that writes these columns.
-- =========================

alter table public.leads add column if not exists session_id text;
alter table public.leads add column if not exists referral_source text;
alter table public.leads add column if not exists referral_detail text;
alter table public.leads add column if not exists landing_page text;

create index if not exists leads_referral_source_idx
  on public.leads(referral_source, created_at desc)
  where referral_source is not null;

create table if not exists public.crawler_hits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  bot text not null,
  path text not null,
  user_agent text
);

create index if not exists crawler_hits_created_at_idx on public.crawler_hits(created_at desc);
create index if not exists crawler_hits_bot_created_at_idx on public.crawler_hits(bot, created_at desc);

alter table public.crawler_hits enable row level security;

drop policy if exists "crawler_hits_admin_read" on public.crawler_hits;
create policy "crawler_hits_admin_read" on public.crawler_hits
  for select using (public.is_admin());

-- Aggregates for /admin/ai-search. Bingbot alone can be thousands of rows a
-- day, past what the page should page through PostgREST to count.
create or replace function public.get_crawler_stats(days_back int default 30)
returns table (bot text, hits_7d bigint, hits_total bigint, last_seen timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    bot,
    count(*) filter (where created_at >= now() - interval '7 days') as hits_7d,
    count(*) as hits_total,
    max(created_at) as last_seen
  from public.crawler_hits
  where created_at >= now() - make_interval(days => greatest(days_back, 1))
  group by bot
  order by hits_total desc;
$$;

create or replace function public.get_crawler_top_paths(p_bot text, days_back int default 30, max_rows int default 15)
returns table (path text, hits bigint, last_seen timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select path, count(*) as hits, max(created_at) as last_seen
  from public.crawler_hits
  where bot = p_bot
    and created_at >= now() - make_interval(days => greatest(days_back, 1))
  group by path
  order by hits desc, last_seen desc
  limit greatest(least(max_rows, 100), 1);
$$;

-- Admin surfaces call these with the service-role key; no public access.
revoke all on function public.get_crawler_stats(int) from public, anon, authenticated;
revoke all on function public.get_crawler_top_paths(text, int, int) from public, anon, authenticated;
grant execute on function public.get_crawler_stats(int) to service_role;
grant execute on function public.get_crawler_top_paths(text, int, int) to service_role;
