-- =========================
-- Migration 024: security + data-integrity fixes (audit 2026-09-15)
-- Idempotent — safe to run more than once, in any order relative to 023.
--
-- 1. leads.unsubscribed_at            — CAN-SPAM opt-out for bulk campaigns
-- 2. shower_certifications.knowledge_last_attempt_at — quiz retry cooldown
-- 3. check_shower_strikes()           — actually maintain showers.strike_count
-- 4. RLS: drop showing_debriefs_shower_insert (any shower could debrief any lead)
-- 5. RLS: drop cert_content_shower_read (exposed the quiz answer key)
-- 6. RLS: drop buildings_partner_update_own (unrestricted columns; unused)
-- 7. showing_claims — one active claim per shower, enforced by the database
-- =========================

-- ============================================================
-- 1. Unsubscribe state for bulk email (/api/admin/email/send skips these,
--    /api/email/unsubscribe sets it from the signed link in every campaign).
-- ============================================================
alter table public.leads
  add column if not exists unsubscribed_at timestamptz;

create index if not exists leads_unsubscribed_at_idx
  on public.leads (unsubscribed_at)
  where unsubscribed_at is null;

-- ============================================================
-- 2. Quiz retry cooldown. The grader used to return correct_answer for every
--    question on every attempt, so the answer key could be harvested in one
--    submission; it is now withheld unless the attempt passed, and a new
--    attempt is refused (429) within 10 minutes of a failed one. That needs a
--    per-row timestamp — shower_certifications has none.
-- ============================================================
alter table public.shower_certifications
  add column if not exists knowledge_last_attempt_at timestamptz;

-- ============================================================
-- 3. showers.strike_count was never written by anything: the column existed
--    from 012, the admin UI displayed it, /api/admin/showers/[id]/strike
--    returned it, and it stayed 0 forever while shower_strikes rows piled up.
--    Extend the existing auto-suspend trigger function to maintain it.
--    (Suspension logic below is unchanged from 012.)
-- ============================================================
create or replace function public.check_shower_strikes()
returns trigger
language plpgsql
security definer
as $$
declare
  v_recent_strikes integer;
  v_total_strikes integer;
begin
  select count(*) into v_recent_strikes
  from public.shower_strikes
  where shower_id = new.shower_id
    and created_at > now() - interval '90 days';

  select count(*) into v_total_strikes
  from public.shower_strikes
  where shower_id = new.shower_id;

  update public.showers
  set strike_count = v_total_strikes,
      updated_at = now()
  where id = new.shower_id;

  if v_recent_strikes >= 3 then
    update public.showers
    set status = 'suspended',
        suspension_reason = 'Automatic: 3 strikes within 90 days',
        updated_at = now()
    where id = new.shower_id
      and status = 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists auto_suspend_on_strikes on public.shower_strikes;
create trigger auto_suspend_on_strikes
  after insert on public.shower_strikes
  for each row execute procedure public.check_shower_strikes();

-- Backfill every shower's strike_count from the rows that already exist.
update public.showers s
set strike_count = coalesce(x.c, 0)
from (
  select sh.id,
         (select count(*) from public.shower_strikes st where st.shower_id = sh.id) as c
  from public.showers sh
) x
where s.id = x.id
  and s.strike_count is distinct from coalesce(x.c, 0);

-- ============================================================
-- 4. showing_debriefs: the insert policy (017) only checked that the row's
--    shower_id was the caller's own — not that the caller held the claim on
--    that showing lead. Any shower could file a debrief against any lead and
--    collect the showing fee. All debrief writes go through
--    /api/shower/leads/[id]/debrief with the service role, which verifies the
--    active claim, so no self-service insert policy is needed.
-- ============================================================
drop policy if exists "showing_debriefs_shower_insert" on public.showing_debriefs;

-- ============================================================
-- 5. building_certification_content rows contain quiz_questions, including
--    each question's correct_index. This policy let any shower read the table
--    directly over PostgREST with the public anon key and lift the entire
--    answer key for every building. The quiz routes serve the questions
--    (stripped of correct_index) with the service role.
-- ============================================================
drop policy if exists "cert_content_shower_read" on public.building_certification_content;

-- ============================================================
-- 6. buildings_partner_update_own (002) allowed a partner to UPDATE their own
--    building rows with no column restriction, so a partner could rewrite
--    status/name/city_id/neighborhood_id/lat/lng/slug/hero_image_url via
--    PostgREST. Every partner write path
--    (src/app/api/partner/buildings/**, src/app/api/partner/leads) goes
--    through createAdminClient() — the service role, which bypasses RLS — so
--    the policy is unused and is dropped rather than narrowed.
-- ============================================================
drop policy if exists "buildings_partner_update_own" on public.buildings;

-- ============================================================
-- 7. A shower may hold at most one active claim. The API checked this with a
--    SELECT before INSERT, which two concurrent claims both pass. Enforce it
--    in the database; the claim route maps 23505 to a 409.
--    Cancel any duplicate actives first (keep the earliest) so the index can
--    be created on an existing, possibly dirty, table.
-- ============================================================
update public.showing_claims c
set status = 'cancelled',
    cancelled_at = coalesce(c.cancelled_at, now())
where c.status = 'active'
  and exists (
    select 1 from public.showing_claims older
    where older.shower_id = c.shower_id
      and older.status = 'active'
      and (older.claimed_at, older.id) < (c.claimed_at, c.id)
  );

create unique index if not exists showing_claims_one_active_per_shower
  on public.showing_claims (shower_id)
  where status = 'active';
