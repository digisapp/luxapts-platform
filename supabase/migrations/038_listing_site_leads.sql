-- =========================
-- Migration 038: leads from listing sites (Apartments.com, …)
-- Idempotent — safe to run more than once.
--
-- Apartments.com emails every renter inquiry to team@staycio.com. The Resend
-- webhook keeps storing it in the admin inbox and now also turns it into a
-- lead (src/lib/leads/listing-lead.ts).
--
-- 1. leads.source accepts the listing sites. Zillow, Rent.com and
--    ApartmentList are allowed now so adding one later is a code change only.
-- 2. leads.needs_review: an inquiry the parser could not read (no renter
--    email or phone), or one whose sender failed DMARC, is still stored as a
--    lead, flagged so someone reads the original email.
--
-- Apply BEFORE deploying the code that writes these values.
-- =========================

alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads
  add constraint leads_source_check
  check (source in (
    'web_form', 'chat', 'voice', 'microsite',
    'apartments.com', 'zillow.com', 'rent.com', 'apartmentlist.com'
  ));

alter table public.leads add column if not exists needs_review boolean not null default false;

create index if not exists leads_needs_review_idx
  on public.leads(created_at desc)
  where needs_review;
