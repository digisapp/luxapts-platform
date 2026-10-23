-- =========================
-- Migration 040: condo buildings + MLS rental listings (IDX)
-- Idempotent — safe to run more than once.
--
-- Miami's condo towers have no leasing office to scrape: owners list their
-- units on the MLS. The brokerage's IDX feed (RESO Web API via Trestle or
-- Bridge) is synced into mls_listings, matched to a building by address, and
-- shown on the building page with the listing brokerage credited.
--
-- 1. buildings.property_type: 'rental' (one operator, scraped) or 'condo'
--    (individually owned, listings from the MLS).
-- 2. mls_listings: one row per MLS lease listing (RESO Data Dictionary
--    names). Rows the feed stops returning are marked inactive by the sync,
--    never shown again. Service-role access only.
-- =========================

alter table public.buildings add column if not exists property_type text not null default 'rental';
alter table public.buildings drop constraint if exists buildings_property_type_check;
alter table public.buildings
  add constraint buildings_property_type_check check (property_type in ('rental', 'condo'));

create table if not exists public.mls_listings (
  listing_key text primary key,              -- RESO ListingKey (stable per MLS)
  listing_id text,                           -- RESO ListingId: the MLS number shown to people
  building_id uuid references public.buildings(id) on delete set null,
  standard_status text not null,             -- Active, Pending, Closed, …
  is_active boolean not null default true,   -- false once the feed stops returning it as Active
  property_type text,                        -- ResidentialLease expected
  list_price integer,
  bedrooms integer,
  bathrooms numeric,
  living_area integer,                       -- sq ft
  unit_number text,
  street_number text,
  street_name text,
  unparsed_address text,
  postal_code text,
  city text,
  building_name text,
  available_date date,
  lease_term text,
  furnished text,
  pets_allowed text,
  public_remarks text,
  photo_urls text[] not null default '{}',
  list_office_name text,                     -- required attribution
  list_office_phone text,
  list_agent_name text,
  modification_timestamp timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw jsonb
);

create index if not exists mls_listings_building_active_idx
  on public.mls_listings(building_id, list_price)
  where is_active;
create index if not exists mls_listings_address_idx on public.mls_listings(street_number, postal_code);
create index if not exists mls_listings_modified_idx on public.mls_listings(modification_timestamp desc);

alter table public.mls_listings enable row level security;
-- No policies: read and written only with the service-role key.

-- Sync bookkeeping (last successful pull, for incremental syncs)
create table if not exists public.mls_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  fetched integer,
  upserted integer,
  matched integer,
  deactivated integer,
  error text
);
alter table public.mls_sync_runs enable row level security;
