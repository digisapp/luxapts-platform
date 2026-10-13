-- =========================
-- Migration 037: NYC contacts — recruiting agents to Staycio
-- Idempotent — safe to run more than once.
--
-- The 552 brokers in the book (other agents who asked about listings) are
-- recruiting prospects, not leads: they get their own pipeline
-- (partner_status) and their firm (company, from their work email).
--
-- 1. company: firm name for known brokerages, else the email domain;
--    nothing for personal mail (gmail...). Set by the write trigger for
--    brokers, so imports and re-classified contacts get it too.
-- 2. partner_status: not_contacted → reached_out → talking → meeting →
--    joined / not_interested. Every broker starts at not_contacted; the
--    first call, text or email logged moves them to reached_out.
-- 3. "No name" is FUB's placeholder, not a name: cleared (682 contacts),
--    so a template greets "Hi there," instead of "Hi No name,". For
--    brokers with a first.last work email the name is filled in from it
--    and marked as a guess in extra."Name guessed from email".
-- =========================

alter table public.crm_contacts add column if not exists company text;
alter table public.crm_contacts add column if not exists partner_status text;
alter table public.crm_contacts drop constraint if exists crm_contacts_partner_status_check;
alter table public.crm_contacts add constraint crm_contacts_partner_status_check
  check (partner_status in ('not_contacted', 'reached_out', 'talking', 'meeting', 'joined', 'not_interested'));

create index if not exists crm_contacts_company_idx on public.crm_contacts (company) where company is not null;
create index if not exists crm_contacts_partner_status_idx on public.crm_contacts (partner_status) where partner_status is not null;

-- Firm name from an email address. Only firms whose domain is certain are
-- named; any other business domain is shown as the domain itself.
create or replace function public.crm_company_from_email(p_email text)
returns text
language sql
immutable
as $$
  select case d
    when 'compass.com' then 'Compass'
    when 'corcoran.com' then 'Corcoran'
    when 'elliman.com' then 'Douglas Elliman'
    when 'douglaselliman.com' then 'Douglas Elliman'
    when 'bhsusa.com' then 'Brown Harris Stevens'
    when 'brownharrisstevens.com' then 'Brown Harris Stevens'
    when 'serhant.com' then 'SERHANT.'
    when 'kw.com' then 'Keller Williams'
    when 'nestseekers.com' then 'Nest Seekers International'
    when 'sothebys.realty' then 'Sotheby''s International Realty'
    when 'sothebysrealty.com' then 'Sotheby''s International Realty'
    when 'theagencyre.com' then 'The Agency'
    when 'elegran.com' then 'Elegran'
    when 'bondnewyork.com' then 'Bond New York'
    when 'warburgrealty.com' then 'Warburg Realty'
    when 'exprealty.com' then 'eXp Realty'
    when 'weichert.com' then 'Weichert'
    when 'coldwellbanker.com' then 'Coldwell Banker'
    when 'mayellre.com' then 'Mayell Real Estate'
    else case
      when d is null or d = '' then null
      when d ~ '^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|aol|proton|protonmail|gmx)\.' then null
      when d in ('renthop-mail.com', 'email.rent.com', 'privaterelay.appleid.com', 'test.com', 'example.com') then null
      else d
    end
  end
  from (select lower(split_part(coalesce(p_email, ''), '@', 2)) as d) x
$$;

-- Name from a first.last (or first_last / first-last) work email; null
-- when the address does not split cleanly into two names.
create or replace function public.crm_name_from_email(p_email text)
returns text[]
language sql
immutable
as $$
  select case
    when m is null then null
    when m[1] in ('info', 'office', 'rentals', 'rental', 'leasing', 'team', 'admin', 'contact', 'hello', 'sales', 'nyc', 'ny', 'agent', 'agents')
      or m[2] in ('info', 'office', 'rentals', 'rental', 'leasing', 'team', 'admin', 'contact', 'hello', 'sales', 'nyc', 'ny', 'agent', 'agents')
      then null
    else array[initcap(m[1]), initcap(m[2])]
  end
  from (
    select regexp_match(regexp_replace(lower(split_part(coalesce(p_email, ''), '@', 1)), '[0-9]+', '', 'g'), '^([a-z]{2,})[._-]([a-z]{2,})$') as m
  ) x
$$;

-- The write trigger, now also filling a broker's company and status.
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
    new.neighborhood,
    new.company
  ));
  -- Keep the domain list in step with RELAY_EMAIL_DOMAINS (src/lib/crm/normalize.ts).
  -- A contact tagged "Bounced" (FUB) has no working email either.
  new.has_real_email := not ('Bounced' = any(new.tags)) and exists (
    select 1 from unnest(new.emails) e
     where e !~ '@(renthop-mail\.com|email\.rent\.com)$'
  );
  new.cycle_month := extract(month from new.added_at at time zone 'America/New_York')::smallint;
  if new.kind = 'broker' then
    new.company := coalesce(new.company, crm_company_from_email(new.emails[1]));
    new.partner_status := coalesce(new.partner_status, 'not_contacted');
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- The first touch logged on a not-yet-contacted broker moves them along.
create or replace function public.crm_activity_touch()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_touch boolean := new.direction = 'outbound'
    and new.kind in ('call', 'text', 'email', 'whatsapp');
  v_reply boolean := new.direction = 'inbound'
    and new.kind in ('call', 'text', 'email', 'whatsapp');
begin
  update public.crm_contacts c set
    last_activity_at = greatest(c.last_activity_at, new.occurred_at),
    contacted = c.contacted or v_touch,
    last_contacted_at = case when v_touch
      then greatest(c.last_contacted_at, new.occurred_at) else c.last_contacted_at end,
    last_inbound_at = case when v_reply
      then greatest(c.last_inbound_at, new.occurred_at) else c.last_inbound_at end,
    partner_status = case when v_touch and c.partner_status = 'not_contacted'
      then 'reached_out' else c.partner_status end
  where c.id = new.contact_id;
  return null;
end;
$$;

-- ------------------------------------------------------------
-- 3. "No name" placeholders, then names from email for brokers.
-- ------------------------------------------------------------
update public.crm_contacts
   set first_name = null
 where lower(trim(first_name)) in ('no name', 'noname', 'unknown', 'n/a', 'na', 'none');

update public.crm_contacts c
   set first_name = g.n[1],
       last_name = g.n[2],
       extra = c.extra || jsonb_build_object('Name guessed from email', c.emails[1])
  from (select id, crm_name_from_email(emails[1]) n from public.crm_contacts where kind = 'broker') g
 where c.id = g.id
   and g.n is not null
   and c.first_name is null
   and c.last_name is null;

-- ------------------------------------------------------------
-- 1 + 2. Backfill brokers (the trigger fills company and status).
-- ------------------------------------------------------------
update public.crm_contacts set kind = kind where kind = 'broker' and (company is null or partner_status is null);

-- Facets: firms and recruiting statuses for the Recruiting tab.
create or replace function public.crm_facets()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object('value', stage, 'count', n) order by n desc)
        from (select stage, count(*) n from crm_contacts where is_active group by stage) s
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('value', source, 'count', n) order by n desc)
        from (select source, count(*) n from crm_contacts
               where is_active and source is not null group by source) s
    ), '[]'::jsonb),
    'agents', coalesce((
      select jsonb_agg(jsonb_build_object('value', previous_agent, 'count', n) order by n desc)
        from (select previous_agent, count(*) n from crm_contacts
               where is_active and previous_agent is not null group by previous_agent) s
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object('value', t, 'count', n) order by n desc)
        from (select t, count(*) n from crm_contacts, unnest(tags) t
               where is_active group by t order by count(*) desc limit 500) s
    ), '[]'::jsonb),
    'neighborhoods', coalesce((
      select jsonb_agg(jsonb_build_object('value', neighborhood, 'count', n) order by n desc)
        from (select neighborhood, count(*) n from crm_contacts
               where is_active and neighborhood is not null group by neighborhood) s
    ), '[]'::jsonb),
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object('value', company, 'count', n) order by n desc)
        from (select company, count(*) n from crm_contacts
               where is_active and kind = 'broker' and company is not null group by company) s
    ), '[]'::jsonb),
    'broker_neighborhoods', coalesce((
      select jsonb_agg(jsonb_build_object('value', neighborhood, 'count', n) order by n desc)
        from (select neighborhood, count(*) n from crm_contacts
               where is_active and kind = 'broker' and neighborhood is not null group by neighborhood) s
    ), '[]'::jsonb),
    'partner', coalesce((
      select jsonb_agg(jsonb_build_object('value', partner_status, 'count', n) order by n desc)
        from (select partner_status, count(*) n from crm_contacts
               where is_active and kind = 'broker' and partner_status is not null group by partner_status) s
    ), '[]'::jsonb)
  );
$$;

-- Bulk recruiting status for a selection or a whole filtered list.
create or replace function public.crm_bulk_set_partner(p_ids uuid[], p_status text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  update crm_contacts set partner_status = p_status
   where id = any(p_ids) and kind = 'broker' and partner_status is distinct from p_status;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.crm_company_from_email(text) from public, anon, authenticated;
revoke all on function public.crm_name_from_email(text) from public, anon, authenticated;
revoke all on function public.crm_facets() from public, anon, authenticated;
revoke all on function public.crm_bulk_set_partner(uuid[], text) from public, anon, authenticated;
grant execute on function public.crm_company_from_email(text) to service_role;
grant execute on function public.crm_name_from_email(text) to service_role;
grant execute on function public.crm_facets() to service_role;
grant execute on function public.crm_bulk_set_partner(uuid[], text) to service_role;
