-- 019: Lead unification — bridge renter leads into the shower showing-lead pipeline.
--
-- Before this migration the two lead systems (leads / showing_leads) were
-- disconnected: a renter tour request sat in the CRM until an admin manually
-- re-posted it as a showing lead. This adds:
--   1. Structured tour fields on leads (previously mashed into the notes text)
--   2. showing_leads.source_lead_id so attribution flows lead -> tour -> commission
--   3. Nullable posted_by so system-generated showing leads need no admin poster
--
-- Idempotent: safe to re-run.

alter table public.leads
  add column if not exists tour_date date,
  add column if not exists tour_time time;

alter table public.showing_leads
  add column if not exists source_lead_id uuid references public.leads(id) on delete set null;

-- At most one auto-bridged showing lead per renter lead
create unique index if not exists idx_showing_leads_source_lead
  on public.showing_leads(source_lead_id)
  where source_lead_id is not null;

-- System-created showing leads have no admin poster
alter table public.showing_leads alter column posted_by drop not null;
