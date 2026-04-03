-- =========================
-- LuxApts Shower System
-- =========================
-- Gamified apartment showing platform:
-- Showers are independent contractors who claim leads, tour apartments,
-- submit debriefs, and earn $150 showing fee + 25% placement bonus.

-- =========================
-- Showers (independent contractor profiles)
-- =========================
create table if not exists public.showers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  display_name text not null,
  phone text,
  photo_url text,
  bio text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'suspended', 'terminated')),
  tier text not null default 'rookie'
    check (tier in ('rookie', 'premier', 'elite')),
  total_showings integer not null default 0,
  avg_rating numeric(3,2) not null default 0,
  strike_count integer not null default 0,
  -- Contractor agreement acceptance
  agreement_accepted boolean not null default false,
  agreement_accepted_at timestamptz,
  -- Admin fields
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- Building Certification Content (admin-managed per building)
-- =========================
create table if not exists public.building_certification_content (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade not null unique,
  -- Quiz: array of {question, options: string[], correct_index: number, explanation?: string}
  quiz_questions jsonb not null default '[]'::jsonb,
  -- Additional study materials
  key_selling_points text,
  amenity_notes text,
  pet_policy_notes text,
  parking_notes text,
  pricing_notes text,
  -- Shadow requirement (default 2 confirmed shadows before certified)
  shadows_required integer not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- Shower Certifications (per shower per building)
-- =========================
create table if not exists public.shower_certifications (
  id uuid primary key default gen_random_uuid(),
  shower_id uuid references public.showers(id) on delete cascade not null,
  building_id uuid references public.buildings(id) on delete cascade not null,
  -- Knowledge tier
  knowledge_attempts integer not null default 0,
  knowledge_best_score integer, -- percentage 0-100
  knowledge_passed_at timestamptz,
  -- Shadow tier
  shadow_count integer not null default 0,
  shadow_completed_at timestamptz,
  -- Certification
  certified_at timestamptz,
  expires_at timestamptz, -- 12 months from certified_at
  status text not null default 'in_progress'
    check (status in ('in_progress', 'shadow_pending', 'certified', 'expired')),
  unique(shower_id, building_id)
);

-- =========================
-- Shadow Sessions (observer logs for certification)
-- =========================
create table if not exists public.shadow_sessions (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade not null,
  -- The certified shower who led the tour (and gets mentorship bonus)
  lead_shower_id uuid references public.showers(id) not null,
  -- The shower who was observing
  observer_shower_id uuid references public.showers(id) not null,
  -- Optional link to the actual showing
  showing_lead_id uuid, -- FK added after showing_leads table is created
  -- Lead shower confirms observer was present
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  mentorship_bonus_paid boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================
-- Showing Leads (posted by admin)
-- =========================
create table if not exists public.showing_leads (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete restrict not null,
  -- Client info (visible to Shower only after claiming)
  client_name text not null,
  client_email text,
  client_phone text,
  -- Showing details
  preferred_date date not null,
  preferred_time time not null,
  unit_type text, -- e.g. "1BR", "2BR", "Studio"
  notes text, -- private admin notes
  special_instructions text, -- shown to the Shower after claiming
  -- Status tracking
  status text not null default 'open'
    check (status in ('open', 'claimed', 'in_progress', 'completed', 'cancelled', 'no_show')),
  -- Attribution (for placement bonus)
  lease_signed boolean not null default false,
  lease_signed_at timestamptz,
  monthly_rent numeric(10,2), -- filled in when lease closes
  -- Admin
  posted_by uuid references auth.users(id) not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz -- unclaimed leads auto-expire
);

-- Add FK from shadow_sessions to showing_leads now that the table exists
alter table public.shadow_sessions
  add constraint shadow_sessions_showing_lead_id_fkey
  foreign key (showing_lead_id) references public.showing_leads(id) on delete set null;

-- =========================
-- Showing Claims (Shower claims a lead)
-- =========================
create table if not exists public.showing_claims (
  id uuid primary key default gen_random_uuid(),
  showing_lead_id uuid references public.showing_leads(id) on delete cascade not null unique,
  shower_id uuid references public.showers(id) not null,
  claimed_at timestamptz not null default now(),
  status text not null default 'active'
    check (status in ('active', 'cancelled', 'completed', 'no_show')),
  -- If cancelled
  cancelled_at timestamptz,
  cancel_notice_hours numeric(4,1), -- hours of notice given (>=2h = no penalty)
  cancel_reason text
);

-- =========================
-- Showing Debriefs (submitted by Shower post-tour)
-- =========================
create table if not exists public.showing_debriefs (
  id uuid primary key default gen_random_uuid(),
  showing_lead_id uuid references public.showing_leads(id) on delete cascade not null unique,
  shower_id uuid references public.showers(id) not null,
  -- Core debrief
  client_showed_up boolean not null,
  interest_level integer check (interest_level between 1 and 5),
  application_likelihood text
    check (application_likelihood in ('high', 'medium', 'low', 'already_interested')),
  units_of_interest text,
  client_objections text,
  broker_notes text,
  photo_urls text[] not null default '{}',
  -- Client rates the Shower (sent via SMS 1hr after tour)
  client_rating integer check (client_rating between 1 and 5),
  client_rating_received_at timestamptz,
  -- Submission + approval
  submitted_at timestamptz not null default now(),
  admin_approved_at timestamptz,
  admin_approved_by uuid references auth.users(id),
  admin_notes text
);

-- =========================
-- Shower Earnings (wallet)
-- =========================
create table if not exists public.shower_earnings (
  id uuid primary key default gen_random_uuid(),
  shower_id uuid references public.showers(id) not null,
  showing_lead_id uuid references public.showing_leads(id) on delete set null,
  type text not null
    check (type in ('showing_fee', 'placement_bonus', 'mentorship_bonus', 'adjustment')),
  amount numeric(10,2) not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'paid', 'cancelled')),
  description text,
  -- Payout tracking
  approved_at timestamptz,
  paid_at timestamptz,
  -- Placement bonus specifics (paid when brokerage receives commission)
  monthly_rent numeric(10,2),
  brokerage_commission numeric(10,2),
  estimated_pay_date date, -- ~100 days after lease signed
  created_at timestamptz not null default now()
);

-- =========================
-- Commission Records (admin logs when building pays brokerage)
-- =========================
create table if not exists public.commission_records (
  id uuid primary key default gen_random_uuid(),
  showing_lead_id uuid references public.showing_leads(id) not null,
  monthly_rent numeric(10,2) not null,
  commission_amount numeric(10,2) not null, -- half month rent
  -- Attribution splits (shower_id -> percentage, sums to 100)
  attribution jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) not null,
  notes text
);

-- =========================
-- Shower Strikes
-- =========================
create table if not exists public.shower_strikes (
  id uuid primary key default gen_random_uuid(),
  shower_id uuid references public.showers(id) not null,
  showing_lead_id uuid references public.showing_leads(id) on delete set null,
  type text not null
    check (type in ('no_show', 'late_cancel', 'poor_conduct', 'low_rating')),
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) not null
);

-- =========================
-- Helper function: check if current user is a shower
-- =========================
create or replace function public.is_shower()
returns boolean
language sql
stable
security definer
as $$
  select exists(
    select 1 from public.showers
    where user_id = auth.uid()
      and status = 'approved'
  );
$$;

-- Helper: get shower id for current user
create or replace function public.get_shower_id()
returns uuid
language sql
stable
security definer
as $$
  select id from public.showers
  where user_id = auth.uid()
  limit 1;
$$;

-- =========================
-- Trigger: update showers.updated_at
-- =========================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger showers_updated_at
  before update on public.showers
  for each row execute procedure public.set_updated_at();

-- =========================
-- Trigger: auto-update shower stats after debrief approval
-- =========================
create or replace function public.update_shower_stats()
returns trigger
language plpgsql
security definer
as $$
declare
  v_shower_id uuid;
  v_avg_rating numeric;
  v_total_showings integer;
  v_tier text;
begin
  -- Only fire when admin_approved_at is set for the first time
  if (new.admin_approved_at is not null and old.admin_approved_at is null) then
    v_shower_id := new.shower_id;

    -- Recalculate stats
    select
      count(*) filter (where d.admin_approved_at is not null),
      coalesce(avg(d.client_rating) filter (where d.client_rating is not null), 0)
    into v_total_showings, v_avg_rating
    from public.showing_debriefs d
    where d.shower_id = v_shower_id;

    -- Calculate tier
    v_tier := case
      when v_total_showings >= 50 and v_avg_rating >= 4.9 then 'elite'
      when v_total_showings >= 15 and v_avg_rating >= 4.7 then 'premier'
      else 'rookie'
    end;

    update public.showers
    set
      total_showings = v_total_showings,
      avg_rating = v_avg_rating,
      tier = v_tier,
      updated_at = now()
    where id = v_shower_id;
  end if;
  return new;
end;
$$;

create trigger shower_stats_on_debrief_approval
  after update on public.showing_debriefs
  for each row execute procedure public.update_shower_stats();

-- =========================
-- Trigger: auto-suspend shower on 3 strikes in 90 days
-- =========================
create or replace function public.check_shower_strikes()
returns trigger
language plpgsql
security definer
as $$
declare
  v_recent_strikes integer;
begin
  select count(*) into v_recent_strikes
  from public.shower_strikes
  where shower_id = new.shower_id
    and created_at > now() - interval '90 days';

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

create trigger auto_suspend_on_strikes
  after insert on public.shower_strikes
  for each row execute procedure public.check_shower_strikes();

-- =========================
-- Row Level Security
-- =========================
alter table public.showers enable row level security;
alter table public.building_certification_content enable row level security;
alter table public.shower_certifications enable row level security;
alter table public.shadow_sessions enable row level security;
alter table public.showing_leads enable row level security;
alter table public.showing_claims enable row level security;
alter table public.showing_debriefs enable row level security;
alter table public.shower_earnings enable row level security;
alter table public.commission_records enable row level security;
alter table public.shower_strikes enable row level security;

-- Showers table
create policy "showers_read_own"
  on public.showers for select
  using (user_id = auth.uid());

create policy "showers_insert_own"
  on public.showers for insert
  with check (user_id = auth.uid());

create policy "showers_update_own"
  on public.showers for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "showers_admin_all"
  on public.showers for all
  using (public.is_admin())
  with check (public.is_admin());

-- Building certification content (admin writes, approved showers read)
create policy "cert_content_admin_all"
  on public.building_certification_content for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "cert_content_shower_read"
  on public.building_certification_content for select
  using (public.is_shower());

-- Shower certifications (own data + admin)
create policy "shower_certs_read_own"
  on public.shower_certifications for select
  using (shower_id = public.get_shower_id());

create policy "shower_certs_insert_own"
  on public.shower_certifications for insert
  with check (shower_id = public.get_shower_id());

create policy "shower_certs_update_own"
  on public.shower_certifications for update
  using (shower_id = public.get_shower_id());

create policy "shower_certs_admin_all"
  on public.shower_certifications for all
  using (public.is_admin())
  with check (public.is_admin());

-- Shadow sessions
create policy "shadow_sessions_shower_read"
  on public.shadow_sessions for select
  using (
    lead_shower_id = public.get_shower_id()
    or observer_shower_id = public.get_shower_id()
  );

create policy "shadow_sessions_admin_all"
  on public.shadow_sessions for all
  using (public.is_admin())
  with check (public.is_admin());

-- Showing leads: certified showers see open leads; shower sees their claimed leads
create policy "showing_leads_shower_read_open"
  on public.showing_leads for select
  using (
    public.is_shower() and status = 'open'
    or exists (
      select 1 from public.showing_claims sc
      where sc.showing_lead_id = id
        and sc.shower_id = public.get_shower_id()
    )
    or public.is_admin()
  );

create policy "showing_leads_admin_all"
  on public.showing_leads for all
  using (public.is_admin())
  with check (public.is_admin());

-- Showing claims
create policy "showing_claims_shower_own"
  on public.showing_claims for select
  using (shower_id = public.get_shower_id());

create policy "showing_claims_shower_insert"
  on public.showing_claims for insert
  with check (shower_id = public.get_shower_id());

create policy "showing_claims_shower_update"
  on public.showing_claims for update
  using (shower_id = public.get_shower_id());

create policy "showing_claims_admin_all"
  on public.showing_claims for all
  using (public.is_admin())
  with check (public.is_admin());

-- Showing debriefs
create policy "showing_debriefs_shower_own"
  on public.showing_debriefs for select
  using (shower_id = public.get_shower_id());

create policy "showing_debriefs_shower_insert"
  on public.showing_debriefs for insert
  with check (shower_id = public.get_shower_id());

create policy "showing_debriefs_admin_all"
  on public.showing_debriefs for all
  using (public.is_admin())
  with check (public.is_admin());

-- Shower earnings
create policy "shower_earnings_own"
  on public.shower_earnings for select
  using (shower_id = public.get_shower_id());

create policy "shower_earnings_admin_all"
  on public.shower_earnings for all
  using (public.is_admin())
  with check (public.is_admin());

-- Commission records (admin only)
create policy "commission_records_admin_all"
  on public.commission_records for all
  using (public.is_admin())
  with check (public.is_admin());

-- Shower strikes (shower can read own, admin all)
create policy "shower_strikes_own_read"
  on public.shower_strikes for select
  using (shower_id = public.get_shower_id());

create policy "shower_strikes_admin_all"
  on public.shower_strikes for all
  using (public.is_admin())
  with check (public.is_admin());

-- =========================
-- Indexes for performance
-- =========================
create index if not exists idx_showers_user_id on public.showers(user_id);
create index if not exists idx_showers_status on public.showers(status);
create index if not exists idx_shower_certifications_shower_id on public.shower_certifications(shower_id);
create index if not exists idx_shower_certifications_building_id on public.shower_certifications(building_id);
create index if not exists idx_showing_leads_status on public.showing_leads(status);
create index if not exists idx_showing_leads_building_id on public.showing_leads(building_id);
create index if not exists idx_showing_leads_preferred_date on public.showing_leads(preferred_date);
create index if not exists idx_showing_claims_shower_id on public.showing_claims(shower_id);
create index if not exists idx_showing_debriefs_shower_id on public.showing_debriefs(shower_id);
create index if not exists idx_shower_earnings_shower_id on public.shower_earnings(shower_id);
create index if not exists idx_shower_earnings_status on public.shower_earnings(status);
create index if not exists idx_shower_strikes_shower_id on public.shower_strikes(shower_id);
