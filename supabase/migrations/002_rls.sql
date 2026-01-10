-- =========================
-- LuxApts Row Level Security Policies
-- =========================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.cities enable row level security;
alter table public.neighborhoods enable row level security;
alter table public.buildings enable row level security;
alter table public.amenities enable row level security;
alter table public.building_amenities enable row level security;
alter table public.floorplans enable row level security;
alter table public.units enable row level security;
alter table public.unit_price_snapshots enable row level security;
alter table public.listing_sources enable row level security;
alter table public.building_facts enable row level security;
alter table public.building_documents enable row level security;
alter table public.embeddings enable row level security;
alter table public.leads enable row level security;
alter table public.lead_targets enable row level security;
alter table public.lead_events enable row level security;
alter table public.agents enable row level security;
alter table public.agent_assignments enable row level security;
alter table public.partners enable row level security;
alter table public.search_events enable row level security;
alter table public.chat_sessions enable row level security;

-- =========================
-- Profiles
-- =========================
create policy "profiles_read_own"
on public.profiles for select
using (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "profiles_admin_read_all"
on public.profiles for select
using (public.is_admin());

create policy "profiles_admin_all"
on public.profiles for all
using (public.is_admin())
with check (public.is_admin());

-- =========================
-- Cities & Neighborhoods (Public read)
-- =========================
create policy "cities_public_read" on public.cities for select using (true);
create policy "cities_admin_write" on public.cities for all
using (public.is_admin()) with check (public.is_admin());

create policy "neighborhoods_public_read" on public.neighborhoods for select using (true);
create policy "neighborhoods_admin_write" on public.neighborhoods for all
using (public.is_admin()) with check (public.is_admin());

-- =========================
-- Amenities (Public read)
-- =========================
create policy "amenities_public_read" on public.amenities for select using (true);
create policy "amenities_admin_write" on public.amenities for all
using (public.is_admin()) with check (public.is_admin());

-- =========================
-- Buildings (Public read, admin/partner write)
-- =========================
create policy "buildings_public_read" on public.buildings for select using (true);

create policy "buildings_admin_all" on public.buildings for all
using (public.is_admin())
with check (public.is_admin());

create policy "buildings_partner_update_own" on public.buildings for update
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'partner')
  and partner_user_id = auth.uid()
)
with check (partner_user_id = auth.uid());

-- =========================
-- Building Amenities (Public read)
-- =========================
create policy "building_amenities_public_read" on public.building_amenities for select using (true);
create policy "building_amenities_admin_all" on public.building_amenities for all
using (public.is_admin()) with check (public.is_admin());

-- =========================
-- Floorplans (Public read)
-- =========================
create policy "floorplans_public_read" on public.floorplans for select using (true);
create policy "floorplans_admin_all" on public.floorplans for all
using (public.is_admin()) with check (public.is_admin());

-- =========================
-- Units (Public read)
-- =========================
create policy "units_public_read" on public.units for select using (true);
create policy "units_admin_all" on public.units for all
using (public.is_admin()) with check (public.is_admin());

-- =========================
-- Price Snapshots (Public read - prices are shown to everyone)
-- =========================
create policy "snapshots_public_read" on public.unit_price_snapshots for select using (true);
create policy "snapshots_admin_all" on public.unit_price_snapshots for all
using (public.is_admin()) with check (public.is_admin());

-- =========================
-- Listing Sources (Admin only)
-- =========================
create policy "listing_sources_admin_all" on public.listing_sources for all
using (public.is_admin()) with check (public.is_admin());

-- =========================
-- Building Facts & Documents (Admin only - AI reads via service role)
-- =========================
create policy "facts_admin_all" on public.building_facts for all
using (public.is_admin()) with check (public.is_admin());

create policy "docs_admin_all" on public.building_documents for all
using (public.is_admin()) with check (public.is_admin());

-- =========================
-- Embeddings (Admin only - AI reads via service role)
-- =========================
create policy "embeddings_admin_all" on public.embeddings for all
using (public.is_admin()) with check (public.is_admin());

-- =========================
-- Leads (Admin full, Agent assigned only)
-- =========================
create policy "leads_admin_all" on public.leads for all
using (public.is_admin())
with check (public.is_admin());

create policy "leads_agent_read_assigned" on public.leads for select
using (
  exists (
    select 1 from public.agent_assignments aa
    where aa.lead_id = leads.id
      and aa.agent_user_id = auth.uid()
      and aa.status in ('assigned','accepted')
  )
);

create policy "leads_agent_update_assigned" on public.leads for update
using (
  exists (
    select 1 from public.agent_assignments aa
    where aa.lead_id = leads.id
      and aa.agent_user_id = auth.uid()
      and aa.status in ('assigned','accepted')
  )
)
with check (true);

-- =========================
-- Lead Targets
-- =========================
create policy "lead_targets_admin_all" on public.lead_targets for all
using (public.is_admin()) with check (public.is_admin());

create policy "lead_targets_agent_read_assigned" on public.lead_targets for select
using (
  exists (
    select 1 from public.agent_assignments aa
    where aa.lead_id = lead_targets.lead_id
      and aa.agent_user_id = auth.uid()
  )
);

-- =========================
-- Lead Events
-- =========================
create policy "lead_events_admin_all" on public.lead_events for all
using (public.is_admin()) with check (public.is_admin());

create policy "lead_events_agent_read_assigned" on public.lead_events for select
using (
  exists (
    select 1 from public.agent_assignments aa
    where aa.lead_id = lead_events.lead_id
      and aa.agent_user_id = auth.uid()
  )
);

-- =========================
-- Agents
-- =========================
create policy "agents_admin_all" on public.agents for all
using (public.is_admin()) with check (public.is_admin());

create policy "agents_read_own" on public.agents for select
using (user_id = auth.uid());

create policy "agents_update_own" on public.agents for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- =========================
-- Agent Assignments
-- =========================
create policy "aa_admin_all" on public.agent_assignments for all
using (public.is_admin()) with check (public.is_admin());

create policy "aa_agent_read_own" on public.agent_assignments for select
using (agent_user_id = auth.uid());

create policy "aa_agent_update_own" on public.agent_assignments for update
using (agent_user_id = auth.uid())
with check (agent_user_id = auth.uid());

-- =========================
-- Partners
-- =========================
create policy "partners_admin_all" on public.partners for all
using (public.is_admin()) with check (public.is_admin());

create policy "partners_read_own" on public.partners for select
using (user_id = auth.uid());

create policy "partners_update_own" on public.partners for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- =========================
-- Analytics (Admin only)
-- =========================
create policy "search_events_admin_all" on public.search_events for all
using (public.is_admin()) with check (public.is_admin());

-- Allow insert from server (anon key with service role will bypass RLS)
create policy "search_events_insert" on public.search_events for insert
with check (true);

create policy "chat_sessions_admin_all" on public.chat_sessions for all
using (public.is_admin()) with check (public.is_admin());
