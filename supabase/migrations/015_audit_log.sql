-- =========================
-- Migration 015: Admin Audit Log
-- Tracks all privileged admin actions for compliance and dispute resolution.
-- Covers: shower approvals/suspensions, strikes, debrief approvals,
--         lead status changes, commission records, and more.
-- =========================

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  -- Structured action name: "<entity>.<verb>" e.g. "shower.approve", "lead.status_change"
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  -- Before/after or relevant context (kept lean — no PII beyond IDs)
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_id);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs(action);

-- RLS: admins can read all; server-side (service role) can insert
alter table public.audit_logs enable row level security;

create policy "audit_logs_admin_read"
  on public.audit_logs for select
  using (public.is_admin());

-- Allow any authenticated server context to write audit entries
-- (service role bypasses RLS entirely, so this covers non-admin server-side inserts)
create policy "audit_logs_admin_insert"
  on public.audit_logs for insert
  with check (public.is_admin());

create policy "audit_logs_service_insert"
  on public.audit_logs for insert
  with check (auth.role() = 'service_role');
