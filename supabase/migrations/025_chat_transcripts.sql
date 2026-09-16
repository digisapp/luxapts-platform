-- =========================
-- Migration 025: persist Stacy's conversations (audit 2026-09-15)
-- Idempotent — safe to run more than once.
--
-- chat_sessions existed from 001 but stored only counters, and nothing ever
-- wrote to it. Every conversation with the assistant the whole product is
-- built around was discarded: no record of what people asked, what Stacy
-- answered, which searches came back empty, or where she failed them.
--
-- 1. chat_sessions  — session-level facts (surface, who, outcome, health)
-- 2. chat_messages  — the transcript itself, one row per turn
-- =========================

-- ============================================================
-- 1. Session-level columns.
-- ============================================================
alter table public.chat_sessions
  -- Client-generated id, stable for one conversation, so multi-turn chats
  -- group into a single session instead of one row per request.
  add column if not exists session_key text,
  add column if not exists surface text not null default 'chat',
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists city_slug text,
  -- The opening question, denormalised so the session list is readable
  -- without joining every transcript.
  add column if not exists first_question text,
  add column if not exists last_message_at timestamptz,
  add column if not exists tool_calls_count integer not null default 0,
  -- Health signals: the point of the log is finding where Stacy fails.
  add column if not exists error_count integer not null default 0,
  add column if not exists empty_results_count integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_sessions_surface_check'
  ) then
    alter table public.chat_sessions
      add constraint chat_sessions_surface_check
      check (surface in ('chat', 'voice'));
  end if;
end $$;

create unique index if not exists chat_sessions_session_key_uidx
  on public.chat_sessions (session_key)
  where session_key is not null;

create index if not exists chat_sessions_created_at_idx
  on public.chat_sessions (created_at desc);

create index if not exists chat_sessions_surface_idx
  on public.chat_sessions (surface);

-- Sessions worth reviewing: something went wrong, or a search found nothing.
create index if not exists chat_sessions_needs_review_idx
  on public.chat_sessions (created_at desc)
  where error_count > 0 or empty_results_count > 0;

-- ============================================================
-- 2. The transcript. One row per message, including tool calls, so an admin
--    can see exactly which search Stacy ran and how many results came back.
-- ============================================================
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  seq integer not null,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text,
  -- Populated for role = 'tool'
  tool_name text,
  tool_args jsonb,
  result_count integer,
  error text,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

create index if not exists chat_messages_session_id_idx
  on public.chat_messages (session_id, seq);

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at desc);

-- Full-text-ish search over what people actually asked.
create index if not exists chat_messages_user_content_idx
  on public.chat_messages using gin (to_tsvector('english', coalesce(content, '')))
  where role = 'user';

-- ============================================================
-- 3. RLS. Transcripts can contain names, emails and phone numbers a renter
--    typed into the chat, so they are admin/service-role only. The writer
--    uses the service role, which bypasses RLS entirely.
-- ============================================================
alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_admin_all" on public.chat_messages;
create policy "chat_messages_admin_all" on public.chat_messages for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
