-- =========================
-- Migration 030: broker (OP) commission incentives
-- Idempotent — safe to run more than once.
--
-- What each building pays an outside broker for bringing a renter, as told to
-- us by its leasing office. Listed and edited at /admin/incentives.
--
-- Internal only. These are terms a leasing office gives a broker over the
-- phone; they must never reach the public site, Stacy or a microsite. RLS
-- allows admins only, and the app reads the table with the service role.
-- =========================

create table if not exists public.broker_incentives (
  id uuid primary key default gen_random_uuid(),
  -- The name as the team knows it ("CMPND", "AMLI (all Miami locations)").
  building_name text not null,
  -- Optional link to our own record, for its neighborhood and listing page.
  -- Null for buildings we don't list, or a company covering many buildings.
  building_id uuid references public.buildings(id) on delete set null,
  -- pays = the building pays OP; none = it said no; unknown = not confirmed.
  status text not null default 'unknown'
    check (status in ('pays', 'none', 'unknown')),
  -- Free text: offers are "1 month's rent", "$2,000", "1 month, capped at
  -- $3,500", or differ by unit type, so no single number captures them.
  incentive text,
  -- What a broker must do to get paid (book online, realtor hours, etc.).
  conditions text,
  -- The leasing person we spoke with, and how to reach the office.
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  -- When the leasing office last confirmed these terms. Offers change, so the
  -- page shows how old each one is.
  confirmed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists broker_incentives_building_id_idx
  on public.broker_incentives (building_id);

drop trigger if exists broker_incentives_updated_at on public.broker_incentives;
create trigger broker_incentives_updated_at
  before update on public.broker_incentives
  for each row execute procedure public.set_updated_at();

alter table public.broker_incentives enable row level security;

drop policy if exists "broker_incentives_admin_all" on public.broker_incentives;
create policy "broker_incentives_admin_all" on public.broker_incentives for all
  using (public.is_admin())
  with check (public.is_admin());

-- =========================
-- Seed: the first round of calls (Oct 2026 notes). Runs only while the table
-- is empty, so re-running never duplicates or overwrites edits.
--
-- Each row links to our building when exactly one active or coming-soon
-- building matches its name patterns; anything else is left unlinked and can
-- be linked from the page. confirmed_on stays empty: the notes carry no dates.
-- =========================
insert into public.broker_incentives
  (building_name, building_id, status, incentive, conditions,
   contact_name, contact_email, notes)
select
  s.building_name,
  (
    select case when count(*) = 1 then (array_agg(b.id))[1] end
    from public.buildings b
    where b.status <> 'inactive'
      and b.name ilike any (s.patterns)
  ),
  s.status, s.incentive, s.conditions, s.contact_name, s.contact_email, s.notes
from (values
  ('Muze at Met', array['%muze%'], 'pays', '1 month''s rent', null, null, null, null),
  ('Solitair Brickell', array['%solitair%'], 'pays', '$1,000', null, 'Luna', null, null),
  ('Magnus Brickell', array['%magnus%'], 'none', null, null, null, null, null),
  ('29 Wyn', array['%29%wyn%', '%wyn%29%'], 'pays', '1 month''s rent',
    'Make the client''s appointment on their website.', null, null, null),
  ('Arte Grand Central', array['%arte%grand central%'], 'none', null, null, null, null, null),
  ('Maizon Brickell', array['%maizon%'], 'pays', '$2,000',
    'Book the appointment online.', 'Velkies', null, null),
  ('Blu27 Edgewater', array['%blu%27%'], 'pays', '$1,800', null, 'Sarah', null, null),
  ('Remi on the River', array['remi', 'remi %'], 'none', null, null, null, null, null),
  ('AMLI (all Miami locations)', array[]::text[], 'pays', '1 month''s rent, capped at $3,000',
    null, null, null, 'Same terms at every AMLI building in Miami; they have many.'),
  ('Forma Miami', array['forma%'], 'pays', '$2,500',
    'Realtor Fridays, 8:30am only.', 'Julianna', 'leasing@rentsformamiami.com', null),
  ('Berkshire Coral Gables', array['%berkshire%'], 'pays', '$500', null, 'Myra', null, null),
  ('Gio Midtown', array['gio', 'gio %'], 'pays', '$1,500', null, null, null, null),
  ('Strata Wynwood', array['%strata%'], 'pays', '1 month''s rent', null, null, null, null),
  ('Wynwood 25', array['%wynwood 25%'], 'pays', '1 month''s rent', null, 'Nash', null, null),
  ('Miro', array['miro', 'miro %'], 'unknown', null, null, null, null, null),
  ('Wynwood Bay', array['%wynwood bay%'], 'unknown', null, null, null, null, null),
  ('Monarc at Met', array['%monarc%'], 'unknown', null, null, null, null, null),
  ('Soma', array['soma', 'soma %'], 'unknown', null, null, null, null, null),
  ('Bella Isla', array['%bella isla%'], 'none', null, null, null, null, null),
  ('Brickell First', array['%brickell first%'], 'unknown', null, null, null, null,
    'Call back; not confirmed yet.'),
  ('Panorama Tower', array['%panorama%'], 'pays',
    '1BR $1,000 · Sky Level (above the 53rd floor) half a month''s rent',
    'Email leasing@panoramatower.com to schedule a call first. Check availability on Zillow or Apartments.com.',
    'Gabby', 'leasing@panoramatower.com',
    'The 2BR amount is unclear in the call notes; confirm it.'),
  ('Gables Columbus Center', array['%columbus center%'], 'none', null, null, 'Corrina', null, null),
  ('CMPND', array['%cmpnd%', '%namdar%'], 'pays', '1 month''s rent, capped at $3,500',
    'Book on their website.', 'Taylor', null, null)
) as s(building_name, patterns, status, incentive, conditions, contact_name, contact_email, notes)
where not exists (select 1 from public.broker_incentives);
