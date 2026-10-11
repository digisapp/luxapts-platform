-- =========================
-- Migration 033: agent + shower portal integrity (audit 2026-10-11)
-- Idempotent — safe to run more than once. Never fails on existing data: a
-- unique index that duplicates would block is skipped with a NOTICE.
--
-- 1. showing_claims — one LIVE claim per lead (a cancelled claim no longer
--    makes its lead unclaimable forever)
-- 2. shower_earnings — at most one live showing_fee per showing
-- 3. RLS: drop aa_agent_update_own (agent could repoint an assignment's lead)
-- 4. RLS: agents_update_own also pins city_id / service_area
-- 5. commission_records — one commission per showing (double-click race)
-- 6. RLS: drop leads_agent_update_assigned (agent could edit any lead column)
-- 7. RLS: showing_leads_shower_read_claimed compared the wrong id
-- =========================

-- ============================================================
-- 1. 012 declared showing_claims.showing_lead_id UNIQUE, but cancelling a
--    claim keeps its row (status 'cancelled') and reopens the lead, so every
--    later claim hit 23505 → 409 "already claimed" while the lead still showed
--    as open. Replace the constraint with a partial unique index over
--    non-cancelled claims (active / completed / no_show): still one live claim
--    per lead, and the cancel history stays for the claim route's cancel cap.
--    Consistent with 024's showing_claims_one_active_per_shower (≤ 1 active
--    claim per shower) — the two indexes constrain different columns.
--    Index first, constraint dropped only once a UNIQUE index is in place, so
--    the table is never without the guarantee. While the old constraint
--    exists live duplicates are impossible; if it is already gone and
--    duplicates exist, nothing changes (NOTICE) and a re-run after cleanup
--    completes the swap.
-- ============================================================
DO $$
DECLARE
  v_con text;
BEGIN
  IF to_regclass('public.showing_claims_one_live_per_lead') IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.showing_claims
       WHERE status <> 'cancelled'
       GROUP BY showing_lead_id HAVING count(*) > 1
    ) THEN
      RAISE NOTICE 'showing_claims has more than one live claim for a lead; keeping the old unique constraint';
      RETURN;
    END IF;
    CREATE UNIQUE INDEX showing_claims_one_live_per_lead
      ON public.showing_claims (showing_lead_id)
      WHERE status <> 'cancelled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index
     WHERE indexrelid = to_regclass('public.showing_claims_one_live_per_lead')
       AND indisunique
  ) THEN
    RAISE NOTICE 'showing_claims_one_live_per_lead is not unique; keeping the old unique constraint';
    RETURN;
  END IF;

  -- 012's inline UNIQUE has a generated name (normally
  -- showing_claims_showing_lead_id_key); find it by its single column.
  FOR v_con IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.conrelid = 'public.showing_claims'::regclass
       AND c.contype = 'u'
       AND array_length(c.conkey, 1) = 1
       AND a.attname = 'showing_lead_id'
  LOOP
    EXECUTE format('ALTER TABLE public.showing_claims DROP CONSTRAINT %I', v_con);
  END LOOP;
END $$;

-- The dropped constraint's index also served the ON DELETE CASCADE from
-- showing_leads and lookups by lead; the partial index can't (cancelled rows).
create index if not exists idx_showing_claims_showing_lead_id
  on public.showing_claims (showing_lead_id);

-- ============================================================
-- 2. /api/admin/showing-leads/[id]/approve checked admin_approved_at, then
--    updated the debrief and inserted the fee unconditionally — a double
--    click paid the showing fee twice. The route now flips the debrief with a
--    conditional UPDATE; this index is the backstop. Cancelled fee rows are
--    excluded so an admin can void a fee and re-issue it.
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.shower_earnings_one_showing_fee_per_showing') IS NOT NULL THEN
    NULL;
  ELSIF EXISTS (
    SELECT 1 FROM public.shower_earnings
     WHERE type = 'showing_fee' AND status <> 'cancelled' AND showing_lead_id IS NOT NULL
     GROUP BY showing_lead_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'duplicate live showing_fee rows exist; skipping shower_earnings_one_showing_fee_per_showing (cancel the duplicates and re-run)';
  ELSE
    CREATE UNIQUE INDEX shower_earnings_one_showing_fee_per_showing
      ON public.shower_earnings (showing_lead_id)
      WHERE type = 'showing_fee' AND status <> 'cancelled';
  END IF;
END $$;

-- ============================================================
-- 3. aa_agent_update_own (002, never narrowed since) let an agent PATCH their
--    own agent_assignments rows over PostgREST with no column restriction:
--    repoint lead_id at ANY lead — and so gain read/update on it through
--    leads_agent_read_assigned / leads_agent_update_assigned — or flip a
--    declined row back to accepted. The one agent write path,
--    PATCH /api/agent/assignments/[id], uses createAdminClient() (service
--    role, bypasses RLS), as do the admin and auto-routing writers, so the
--    policy is unused and is dropped rather than narrowed.
-- ============================================================
drop policy if exists "aa_agent_update_own" on public.agent_assignments;

-- ============================================================
-- 4. agents_update_own (018) pinned status and commission_rate but left
--    city_id and service_area self-editable, so an agent could move
--    themselves into another city and steer autoAssignAgent()
--    (src/lib/leads/routing.ts routes by agents.city_id). Pinned the same way
--    018 pins its columns. City changes go through PATCH
--    /api/admin/agents/[id] (service role). With this, no agents column an
--    agent could usefully change remains self-editable.
-- ============================================================
drop policy if exists "agents_update_own" on public.agents;
create policy "agents_update_own" on public.agents for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and status = (select a.status from public.agents a where a.user_id = auth.uid())
    and commission_rate is not distinct from
        (select a.commission_rate from public.agents a where a.user_id = auth.uid())
    and city_id is not distinct from
        (select a.city_id from public.agents a where a.user_id = auth.uid())
    and service_area is not distinct from
        (select a.service_area from public.agents a where a.user_id = auth.uid())
  );

-- ============================================================
-- 5. /api/admin/showing-leads/[id]/commission checked for an existing record,
--    then inserted — a double click recorded the commission (and released
--    the placement bonuses) twice. The route maps 23505 to 409.
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.commission_records_one_per_showing') IS NOT NULL THEN
    NULL;
  ELSIF EXISTS (
    SELECT 1 FROM public.commission_records
     GROUP BY showing_lead_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'duplicate commission_records exist; skipping commission_records_one_per_showing (remove the duplicates and re-run)';
  ELSE
    CREATE UNIQUE INDEX commission_records_one_per_showing
      ON public.commission_records (showing_lead_id);
  END IF;
END $$;

-- ============================================================
-- 6. leads_agent_update_assigned (002 → 017) let an assigned agent UPDATE
--    any column of the lead over PostgREST — reassign, rewrite contact
--    details, change source. The agent portal writes leads with the service
--    role after its own assignment and status checks
--    (src/app/agent/leads/[id]/page.tsx), so the policy is unused. Reads
--    (leads_agent_read_assigned) are unchanged.
-- ============================================================
drop policy if exists "leads_agent_update_assigned" on public.leads;

-- ============================================================
-- 7. showing_leads_shower_read_claimed (023) compared sc.showing_lead_id to
--    `id`, which inside the subquery resolves to showing_claims.id — the
--    claim's own id — so it never matched and a shower could read none of
--    the leads they had claimed. Qualified, and cancelled claims excluded
--    (a shower who cancelled no longer gets the renter's details).
-- ============================================================
drop policy if exists "showing_leads_shower_read_claimed" on public.showing_leads;
create policy "showing_leads_shower_read_claimed"
  on public.showing_leads for select
  using (
    exists (
      select 1 from public.showing_claims sc
      where sc.showing_lead_id = showing_leads.id
        and sc.shower_id = public.get_shower_id()
        and sc.status <> 'cancelled'
    )
    or public.is_admin()
  );

-- showing_leads → showing_claims now embeds as an array (no unique
-- constraint on showing_lead_id); make PostgREST pick that up immediately.
notify pgrst, 'reload schema';
