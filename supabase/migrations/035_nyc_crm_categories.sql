-- =========================
-- Migration 035: NYC contacts — who they are, who had them, who is waiting
-- Idempotent — safe to run more than once.
--
-- 1. previous_agent: the brokerage's agents are all gone, so FUB's
--    "Assigned To" is history, not ownership. It moves here; assigned_to is
--    left empty (the admin owns everyone) for if agents are hired again.
-- 2. kind: renter / buyer / broker. A sale-listing inquiry ($1.1M) and a
--    Compass agent asking about a listing are not renters: they must not
--    top "Biggest budget first" or sit in the lease and calling lists.
-- 3. awaiting_reply: their last message came after ours — 3,956 people in
--    the import replied and never heard back.
-- 4. "Unsubscribed" (FUB tag) → do_not_contact; "Bounced" → the email is
--    no longer a way to reach them.
-- 5. crm_templates + crm_settings: saved texts/emails with merge fields.
-- =========================

alter table public.crm_contacts add column if not exists previous_agent text;
alter table public.crm_contacts add column if not exists kind text not null default 'renter';
alter table public.crm_contacts drop constraint if exists crm_contacts_kind_check;
alter table public.crm_contacts
  add constraint crm_contacts_kind_check check (kind in ('renter', 'buyer', 'broker'));
alter table public.crm_contacts add column if not exists awaiting_reply boolean
  generated always as (
    last_inbound_at is not null
    and (last_contacted_at is null or last_inbound_at > last_contacted_at)
  ) stored;

create index if not exists crm_contacts_kind_idx on public.crm_contacts (kind);
create index if not exists crm_contacts_previous_agent_idx on public.crm_contacts (previous_agent);
create index if not exists crm_contacts_awaiting_idx on public.crm_contacts (last_inbound_at desc)
  where awaiting_reply;

-- ------------------------------------------------------------
-- 1. Agents → history
-- ------------------------------------------------------------
update public.crm_contacts
   set previous_agent = assigned_to, assigned_to = null
 where assigned_to is not null and previous_agent is null;

-- ------------------------------------------------------------
-- 2. Kind. Mirrors contactKind() in src/lib/crm/import-map.ts, which
--    classifies future imports; keep the two in step. Only rows at the
--    default ('renter') are touched: a contact set to buyer or broker by
--    hand keeps it, though one set back to renter by hand would be
--    re-classified if this file were ever run again.
-- ------------------------------------------------------------
update public.crm_contacts
   set kind = 'broker'
 where kind = 'renter'
   and (
     'Agent Inquiry' = any(tags)
     or split_part(coalesce(emails[1], ''), '@', 2) in (
       'corcoran.com', 'compass.com', 'elliman.com', 'douglaselliman.com', 'bhsusa.com',
       'brownharrisstevens.com', 'sothebys.realty', 'sothebysrealty.com', 'serhant.com',
       'nestseekers.com', 'kw.com', 'theagencyre.com', 'bondnewyork.com', 'livingny.com',
       'coldwellbanker.com', 'halstead.com', 'citihabitats.com', 'exprealty.com',
       'warburgrealty.com', 'spireny.com', 'mns.com'
     )
   );

update public.crm_contacts
   set kind = 'buyer'
 where kind = 'renter'
   and (price >= 50000 or coalesce(extra->>'Deal Stage', '') like '%Buyers%');

-- ------------------------------------------------------------
-- 4. Opt-outs and bounces
-- ------------------------------------------------------------
update public.crm_contacts
   set do_not_contact = true
 where 'Unsubscribed' = any(tags) and not do_not_contact;

create or replace function public.crm_contacts_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_text := lower(concat_ws(' ',
    new.first_name,
    new.last_name,
    array_to_string(new.emails, ' '),
    -- Digits only, so "212-555" and "(212) 555" both find +12125550123.
    regexp_replace(array_to_string(new.phones, ' '), '[^0-9 ]', '', 'g'),
    array_to_string(new.tags, ' '),
    new.property_address,
    new.neighborhood
  ));
  -- Keep the domain list in step with RELAY_EMAIL_DOMAINS (src/lib/crm/normalize.ts).
  -- A contact tagged "Bounced" (FUB) has no working email either.
  new.has_real_email := not ('Bounced' = any(new.tags)) and exists (
    select 1 from unnest(new.emails) e
     where e !~ '@(renthop-mail\.com|email\.rent\.com)$'
  );
  new.cycle_month := extract(month from new.added_at at time zone 'America/New_York')::smallint;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- Recompute has_real_email for the bounced (the trigger runs on update).
update public.crm_contacts set tags = tags where 'Bounced' = any(tags) and has_real_email;

-- Facets: previous agents and kinds replace assigned agents.
create or replace function public.crm_facets()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object('value', stage, 'count', n) order by n desc)
        from (select stage, count(*) n from crm_contacts group by stage) s
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('value', source, 'count', n) order by n desc)
        from (select source, count(*) n from crm_contacts
               where source is not null group by source) s
    ), '[]'::jsonb),
    'agents', coalesce((
      select jsonb_agg(jsonb_build_object('value', previous_agent, 'count', n) order by n desc)
        from (select previous_agent, count(*) n from crm_contacts
               where previous_agent is not null group by previous_agent) s
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object('value', t, 'count', n) order by n desc)
        from (select t, count(*) n from crm_contacts, unnest(tags) t
               group by t order by count(*) desc limit 500) s
    ), '[]'::jsonb),
    'neighborhoods', coalesce((
      select jsonb_agg(jsonb_build_object('value', neighborhood, 'count', n) order by n desc)
        from (select neighborhood, count(*) n from crm_contacts
               where neighborhood is not null group by neighborhood) s
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.crm_facets() from public, anon, authenticated;
grant execute on function public.crm_facets() to service_role;

-- ------------------------------------------------------------
-- 5. Templates and settings
-- ------------------------------------------------------------
create table if not exists public.crm_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 60),
  channel text not null check (channel in ('text', 'email')),
  subject text check (subject is null or char_length(subject) <= 200),
  body text not null check (char_length(body) between 1 and 2000),
  position integer not null default 0
);

create table if not exists public.crm_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.crm_templates enable row level security;
alter table public.crm_settings enable row level security;
drop policy if exists "crm_templates_admin_all" on public.crm_templates;
create policy "crm_templates_admin_all" on public.crm_templates for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "crm_settings_admin_all" on public.crm_settings;
create policy "crm_settings_admin_all" on public.crm_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- Starter templates, only into an empty table. Fields in {braces} are
-- filled per contact (src/lib/crm/templates.ts).
insert into public.crm_templates (name, channel, subject, body, position)
select * from (values
  ('Lease coming up', 'text', null,
   'Hi {first_name}, it''s {my_name}. You asked about {listing} {when}. Is your lease coming up? I can send a few options in {neighborhood} around {budget}.', 0),
  ('Sorry for the slow reply', 'text', null,
   'Hi {first_name}, it''s {my_name}. Sorry for the slow reply! Are you still looking for a place? I can send you what''s available right now.', 1),
  ('Still looking?', 'text', null,
   'Hi {first_name}, {my_name} here. Still looking for a place in {neighborhood}? A few new {beds} listings just came up around {budget}.', 2),
  ('Options by email', 'email', 'Apartments in {neighborhood}',
   E'Hi {first_name},\n\nYou asked about {listing} {when}. If you''re still looking, I have a few {beds} options in {neighborhood} around {budget} I can send over.\n\nWhen is a good time to talk?\n\n{my_name}', 3)
) as t(name, channel, subject, body, position)
where not exists (select 1 from public.crm_templates);

-- Bulk "set type" for a selection or a whole list (ids in the POST body).
create or replace function public.crm_bulk_set_kind(p_ids uuid[], p_kind text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  update crm_contacts set kind = p_kind where id = any(p_ids) and kind is distinct from p_kind;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.crm_bulk_set_kind(uuid[], text) from public, anon, authenticated;
grant execute on function public.crm_bulk_set_kind(uuid[], text) to service_role;

-- A Twilio message is logged once even when Twilio retries its webhook.
create unique index if not exists crm_activities_twilio_sid
  on public.crm_activities ((meta->>'sid'))
  where meta ? 'sid';
