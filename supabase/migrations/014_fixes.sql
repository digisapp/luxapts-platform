-- =========================
-- Migration 014: RLS Policy Fixes, Missing Indexes & Email Campaign Tracking
-- =========================

-- =========================
-- 1. RLS Policy Fixes
-- =========================

-- Fix: shower_strikes — admins need to update/delete strikes (e.g. to correct errors)
drop policy if exists "shower_strikes_admin_update" on public.shower_strikes;
create policy "shower_strikes_admin_update"
  on public.shower_strikes for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "shower_strikes_admin_delete" on public.shower_strikes;
create policy "shower_strikes_admin_delete"
  on public.shower_strikes for delete
  using (public.is_admin());

-- Fix: building_certification_content — admins need to delete stale quiz content
drop policy if exists "cert_content_admin_delete" on public.building_certification_content;
create policy "cert_content_admin_delete"
  on public.building_certification_content for delete
  using (public.is_admin());

-- Fix: user_saved_searches — admins need to read all for analytics/compliance
drop policy if exists "user_saved_searches_admin_read" on user_saved_searches;
create policy "user_saved_searches_admin_read"
  on user_saved_searches for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Fix: leads — agents assigned to a lead can update notes + status (not financials)
-- This complements the existing select policy for agents.
-- Drops the 002 version first (same name, weaker `with check (true)`) —
-- without this drop, CREATE POLICY errors and rolls back the whole migration.
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

-- =========================
-- 2. Missing Performance Indexes
-- =========================

-- Price filtering in search
create index if not exists idx_unit_price_snapshots_rent
  on public.unit_price_snapshots(rent);

-- Shower listing by status + tier
create index if not exists idx_showers_status_tier
  on public.showers(status, tier);

-- Email AI analytics (supplement the existing ai_category index)
create index if not exists idx_emails_ai_confidence
  on public.emails(ai_confidence)
  where ai_confidence is not null;

-- Shower earnings by type for reporting
create index if not exists idx_shower_earnings_type
  on public.shower_earnings(type, status);

-- Showing debriefs pending admin approval
create index if not exists idx_showing_debriefs_pending_approval
  on public.showing_debriefs(admin_approved_at)
  where admin_approved_at is null;

-- Shadow sessions for mentorship tracking
create index if not exists idx_shadow_sessions_lead_shower
  on public.shadow_sessions(lead_shower_id, confirmed_at);

-- =========================
-- 3. Email Campaign Delivery Tracking
-- Add sent_count, failed_count, and status columns so campaigns
-- can track partial failures and be queried by delivery state.
-- =========================

alter table public.email_campaigns
  add column if not exists sent_count integer not null default 0,
  add column if not exists failed_count integer not null default 0,
  add column if not exists status text not null default 'completed'
    check (status in ('pending', 'sending', 'completed', 'partial_failure', 'failed'));

-- Backfill existing rows: assume all existing campaigns completed fully
update public.email_campaigns
set sent_count = recipients_count,
    status = 'completed'
where sent_count = 0
  and recipients_count > 0;

create index if not exists idx_email_campaigns_status
  on public.email_campaigns(status)
  where status != 'completed';

-- =========================
-- 4. Unique constraint on unit_price_snapshots to prevent duplicate captures
--    NOTE: Only add if no existing duplicates. Safe to apply on a fresh schema.
--    On existing data, use a UNIQUE INDEX CONCURRENTLY after deduplication.
-- =========================
-- (Skipped here — run manually after deduplicating:)
-- CREATE UNIQUE INDEX CONCURRENTLY idx_unit_price_snapshots_unique
--   ON public.unit_price_snapshots(unit_id, captured_at);
