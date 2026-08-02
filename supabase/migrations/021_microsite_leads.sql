-- 021: Microsite lead capture
-- Allows leads from the building microsites (namdartowers.com, downtown6miami.com, etc.)
-- to flow into the unified leads pipeline with their own source + attribution.
--
-- The /api/microsite-leads route works before this migration runs (it falls back to
-- source='web_form' with attribution in notes); applying it upgrades those inserts to
-- source='microsite' with structured attribution in source_detail.

-- Widen the source check constraint to include 'microsite'
alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads
  add constraint leads_source_check
  check (source in ('web_form', 'chat', 'voice', 'microsite'));

-- Which microsite domain the lead came from (e.g. 'namdartowers.com')
alter table public.leads add column if not exists source_detail text;

create index if not exists leads_source_detail_idx
  on public.leads(source_detail)
  where source_detail is not null;
