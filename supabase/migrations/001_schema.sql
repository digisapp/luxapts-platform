-- =========================
-- LuxApts Database Schema
-- =========================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector"; -- pgvector for embeddings

-- =========================
-- Profiles (Auth -> App users)
-- =========================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','agent','partner','renter')),
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

-- Helper function: check if current user is admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

-- Helper function: get current user's role
create or replace function public.get_user_role()
returns text
language sql
stable
security definer
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'renter'),
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

-- Trigger to create profile on signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================
-- Cities & Neighborhoods
-- =========================
create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  state text,
  country text default 'USA',
  center_lat numeric,
  center_lng numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.neighborhoods (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null,
  slug text not null,
  center_lat numeric,
  center_lng numeric,
  polygon_geojson jsonb,
  created_at timestamptz not null default now(),
  unique(city_id, slug)
);

create index if not exists neighborhoods_city_id_idx on public.neighborhoods(city_id);

-- =========================
-- Inventory Core
-- =========================
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete restrict,
  neighborhood_id uuid references public.neighborhoods(id) on delete set null,
  partner_user_id uuid references public.profiles(id) on delete set null,

  name text not null,
  address_1 text not null,
  address_2 text,
  zip text,
  lat numeric,
  lng numeric,

  year_built int,
  stories int,
  description text,
  website_url text,
  leasing_phone text,
  leasing_email text,

  pet_policy text,
  parking_policy text,
  deposit_policy text,
  move_in_fees jsonb,

  status text not null default 'active' check (status in ('active','inactive','coming_soon')),
  created_at timestamptz not null default now()
);

create index if not exists buildings_city_id_idx on public.buildings(city_id);
create index if not exists buildings_neighborhood_id_idx on public.buildings(neighborhood_id);
create index if not exists buildings_status_idx on public.buildings(status);

create table if not exists public.amenities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  icon text,
  created_at timestamptz not null default now()
);

create table if not exists public.building_amenities (
  building_id uuid not null references public.buildings(id) on delete cascade,
  amenity_id uuid not null references public.amenities(id) on delete cascade,
  details text,
  created_at timestamptz not null default now(),
  primary key (building_id, amenity_id)
);

create table if not exists public.floorplans (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  name text not null,
  beds int not null,
  baths numeric not null,
  sqft_min int,
  sqft_max int,
  layout_image_url text,
  tour_3d_url text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists floorplans_building_id_idx on public.floorplans(building_id);
create index if not exists floorplans_beds_idx on public.floorplans(beds);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  floorplan_id uuid references public.floorplans(id) on delete set null,

  unit_number text,
  floor text,
  view text,

  beds int,
  baths numeric,
  sqft int,

  is_available boolean not null default false,
  available_on date,

  created_at timestamptz not null default now()
);

create index if not exists units_building_id_idx on public.units(building_id);
create index if not exists units_is_available_idx on public.units(is_available);
create index if not exists units_beds_idx on public.units(beds);

create table if not exists public.listing_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('api','csv','manual','scrape')),
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.unit_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  captured_at timestamptz not null default now(),

  rent int not null,
  net_effective_rent int,
  lease_term_months int,
  concessions text,
  deposit int,
  fees jsonb,

  source_id uuid references public.listing_sources(id) on delete set null
);

create index if not exists unit_price_snapshots_unit_id_captured_at_idx
  on public.unit_price_snapshots (unit_id, captured_at desc);

-- =========================
-- Building Facts & Documents (AI grounding)
-- =========================
create table if not exists public.building_facts (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  key text not null,
  value jsonb not null,
  source text,
  updated_at timestamptz not null default now(),
  unique(building_id, key)
);

create table if not exists public.building_documents (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  title text not null,
  content text not null,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists building_documents_building_id_idx on public.building_documents(building_id);

-- =========================
-- Embeddings (pgvector)
-- =========================
create table if not exists public.embeddings (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('building','floorplan','unit','doc')),
  entity_id uuid not null,
  content text not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Use HNSW index for faster similarity search (better than ivfflat for most cases)
create index if not exists embeddings_hnsw_idx
  on public.embeddings using hnsw (embedding vector_cosine_ops);

-- =========================
-- Leads & Lead Management
-- =========================
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  city_id uuid references public.cities(id) on delete set null,

  name text,
  user_email text,
  user_phone text,

  budget_min int,
  budget_max int,
  beds int,
  move_in_date date,

  preferred_neighborhoods jsonb,
  source text not null check (source in ('web_form','chat','voice')),

  status text not null default 'new'
    check (status in ('new','contacted','touring','applied','leased','lost')),

  notes text
);

create index if not exists leads_city_id_idx on public.leads(city_id);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_created_at_idx on public.leads(created_at desc);

create table if not exists public.lead_targets (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  rank int
);

create index if not exists lead_targets_lead_id_idx on public.lead_targets(lead_id);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_events_lead_id_idx on public.lead_events(lead_id);
create index if not exists lead_events_created_at_idx on public.lead_events(created_at desc);

-- =========================
-- Agents & Agent Assignments
-- =========================
create table if not exists public.agents (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  city_id uuid references public.cities(id) on delete set null,
  service_area jsonb,
  status text not null default 'active' check (status in ('active','paused')),
  commission_rate numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_assignments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  agent_user_id uuid not null references public.agents(user_id) on delete cascade,
  assigned_at timestamptz not null default now(),
  status text not null default 'assigned'
    check (status in ('assigned','accepted','declined','reassigned')),
  reason text
);

create index if not exists agent_assignments_lead_id_idx on public.agent_assignments(lead_id);
create index if not exists agent_assignments_agent_user_id_idx on public.agent_assignments(agent_user_id);

-- =========================
-- Partners (Building owners/brokerages)
-- =========================
create table if not exists public.partners (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  company_name text not null,
  type text not null check (type in ('building','brokerage')),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- =========================
-- Analytics & Tracking (optional, can be added to PostHog later)
-- =========================
create table if not exists public.search_events (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  city_slug text,
  filters jsonb,
  results_count int,
  response_time_ms int,
  created_at timestamptz not null default now()
);

create index if not exists search_events_created_at_idx on public.search_events(created_at desc);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  building_id uuid references public.buildings(id) on delete set null,
  messages_count int not null default 0,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- Helper Views
-- =========================

-- View to get latest price for each unit
create or replace view public.units_with_latest_price as
select
  u.*,
  ps.rent as latest_rent,
  ps.net_effective_rent as latest_net_effective_rent,
  ps.captured_at as price_captured_at
from public.units u
left join lateral (
  select rent, net_effective_rent, captured_at
  from public.unit_price_snapshots
  where unit_id = u.id
  order by captured_at desc
  limit 1
) ps on true;
