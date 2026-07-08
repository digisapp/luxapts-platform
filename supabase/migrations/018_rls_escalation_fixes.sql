-- =========================
-- Migration 018: RLS privilege-escalation fixes (audit 2026-07-08)
-- Idempotent — safe to run on any state.
--
-- The 002 self-update policies used `with check (id/user_id = auth.uid())`
-- with NO column restriction. Because the anon key is public, any
-- authenticated user could PATCH their own row via PostgREST and change
-- privileged columns (profiles.role -> 'admin', agents.commission_rate,
-- partners.status). Migration 017 fixed the signup trigger but not these
-- UPDATE paths. Each policy below is re-created so the owner can still edit
-- their own non-privileged fields, but privileged columns must equal their
-- currently-committed value (subquery reads the OLD row inside the txn).
-- Legitimate privileged changes continue to flow through service-role APIs,
-- which bypass RLS.
-- =========================

-- =========================
-- 1. CRITICAL: profiles — owner cannot change their own role
-- =========================
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

-- =========================
-- 2. HIGH: agents — owner cannot change their own status or commission_rate
-- =========================
drop policy if exists "agents_update_own" on public.agents;
create policy "agents_update_own" on public.agents for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and status = (select a.status from public.agents a where a.user_id = auth.uid())
    and commission_rate is not distinct from
        (select a.commission_rate from public.agents a where a.user_id = auth.uid())
  );

-- =========================
-- 3. HIGH: partners — owner cannot change status / type / company_name
-- (contact_* and other self-service fields remain editable)
-- =========================
drop policy if exists "partners_update_own" on public.partners;
create policy "partners_update_own" on public.partners for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and status = (select p.status from public.partners p where p.user_id = auth.uid())
    and type = (select p.type from public.partners p where p.user_id = auth.uid())
    and company_name = (select p.company_name from public.partners p where p.user_id = auth.uid())
  );

-- =========================
-- 4. Restore admin read on saved searches.
-- 014 created user_saved_searches_admin_read but rolled back wholesale
-- (duplicate policy name aborted its txn); 017 did NOT re-create it, so
-- admins currently have no read path to user_saved_searches under RLS.
-- =========================
drop policy if exists "user_saved_searches_admin_read" on public.user_saved_searches;
create policy "user_saved_searches_admin_read"
  on public.user_saved_searches for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
