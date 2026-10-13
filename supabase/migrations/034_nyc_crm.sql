-- =========================
-- Migration 034: NYC contacts CRM (the brokerage's Follow Up Boss book)
-- Idempotent — safe to run more than once.
--
-- A separate book from `leads` on purpose. `leads` is Staycio's Miami
-- pipeline: the admin dashboard, inbox lead matching, lead alerts, bulk email,
-- the follow-up scripts, Stacy's tools and the agent/partner portals all read
-- it, and every one of them would need an "except NYC" filter to keep 36k
-- brokerage contacts out. Nothing reads these tables but /admin/nyc.
--
-- 1. crm_contacts     — one row per person (FUB "ID" kept as external_id)
-- 2. crm_activities   — timeline: notes, calls, texts, emails, the inquiry
-- 3. crm_tasks        — follow-ups, date-only (crm_contacts.next_task_on)
-- 4. crm_smart_lists  — saved filters
-- 5. RPCs for facets, import matching and bulk edits (service_role only)
-- =========================

create extension if not exists pg_trgm with schema extensions;

-- ============================================================
-- 1. Contacts
-- ============================================================
create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  first_name text,
  last_name text,
  -- Lowercased emails and +E.164-style phones; the first is the primary.
  emails text[] not null default '{}',
  phones text[] not null default '{}',

  stage text not null default 'Lead',
  source text,
  assigned_to text,
  tags text[] not null default '{}',

  -- What they asked about: the listing behind the inquiry, and its terms.
  price integer,
  beds smallint,
  move_in text,
  property_address text,
  property_city text,
  property_state text,
  property_link text,
  -- "Tribeca", from FUB's listing description ("CONDO IN TRIBECA | ...").
  neighborhood text,
  background text,

  do_not_contact boolean not null default false,
  -- Set by crm_contacts_before_write(). RentHop and Rent.com hand out relay
  -- addresses that stop forwarding once the listing is gone, so an email
  -- like that is not a way to reach someone.
  has_real_email boolean not null default false,
  -- Month (1-12, New York) they first inquired, also set by the trigger.
  -- NYC leases run about a year, so people tend to look again around the
  -- same time of year; the "Lease up soon" list keys off this.
  cycle_month smallint,

  -- Maintained by crm_activity_touch() for activities logged in the app, and
  -- computed by the importer for imported history.
  contacted boolean not null default false,
  last_contacted_at timestamptz,
  last_inbound_at timestamptz,
  last_activity_at timestamptz,
  -- Earliest open task, maintained by crm_tasks_sync_next().
  next_task_on date,

  external_id text,
  -- When the person first came in (FUB "Date Added"); created_at is when the
  -- row was written here.
  added_at timestamptz,
  import_batch text,
  -- Every other non-empty column of the import, verbatim, keyed by header.
  extra jsonb not null default '{}'::jsonb,

  search_text text not null default '',

  constraint crm_contacts_external_id_key unique (external_id)
);

create index if not exists crm_contacts_emails_gin on public.crm_contacts using gin (emails);
create index if not exists crm_contacts_phones_gin on public.crm_contacts using gin (phones);
create index if not exists crm_contacts_tags_gin on public.crm_contacts using gin (tags);
create index if not exists crm_contacts_stage_idx on public.crm_contacts (stage);
create index if not exists crm_contacts_next_task_idx on public.crm_contacts (next_task_on);
create index if not exists crm_contacts_last_contacted_idx on public.crm_contacts (last_contacted_at);
create index if not exists crm_contacts_last_activity_idx on public.crm_contacts (last_activity_at);
create index if not exists crm_contacts_added_idx on public.crm_contacts (added_at);
create index if not exists crm_contacts_cycle_month_idx on public.crm_contacts (cycle_month);
create index if not exists crm_contacts_price_idx on public.crm_contacts (price);
create index if not exists crm_contacts_neighborhood_idx on public.crm_contacts (neighborhood);

-- Trigram index for "contains" search over name, email, phone digits,
-- tags and the inquiry address. The opclass lives wherever pg_trgm is
-- installed (extensions on Supabase, public on older projects).
do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  execute format(
    'create index if not exists crm_contacts_search_trgm on public.crm_contacts using gin (search_text %I.gin_trgm_ops)',
    v_schema
  );
end $$;

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
  new.has_real_email := exists (
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

drop trigger if exists crm_contacts_before_write on public.crm_contacts;
create trigger crm_contacts_before_write
  before insert or update on public.crm_contacts
  for each row execute function public.crm_contacts_before_write();

-- ============================================================
-- 2. Activities
-- ============================================================
create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  occurred_at timestamptz not null default now(),
  kind text not null
    check (kind in ('note', 'call', 'text', 'email', 'whatsapp', 'inquiry', 'stage', 'task')),
  direction text check (direction in ('inbound', 'outbound')),
  outcome text check (outcome in ('talked', 'voicemail', 'no_answer', 'bad_number')),
  body text,
  -- Who did it: the agent named in imported history, or the admin who logged it.
  actor text,
  created_by uuid references public.profiles(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  -- Set on imported history so a re-import adds only what is new. A plain
  -- (non-partial) constraint: PostgREST's on_conflict cannot target a
  -- partial index. NULLs are distinct, so app-logged rows never collide.
  import_key text,
  constraint crm_activities_import_key unique (contact_id, import_key)
);

create index if not exists crm_activities_contact_time
  on public.crm_activities (contact_id, occurred_at desc);

-- Keeps the contact's contact/reply/activity stamps current for activities
-- logged in the app. Imported rows (import_key set) skip it: the importer
-- computes those stamps itself, and 100k+ per-row contact updates during an
-- import would be slow and pointless.
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
      then greatest(c.last_inbound_at, new.occurred_at) else c.last_inbound_at end
  where c.id = new.contact_id;
  return null;
end;
$$;

drop trigger if exists crm_activity_touch on public.crm_activities;
create trigger crm_activity_touch
  after insert on public.crm_activities
  for each row
  when (new.import_key is null and new.kind in ('note', 'call', 'text', 'email', 'whatsapp'))
  execute function public.crm_activity_touch();

-- ============================================================
-- 3. Tasks (follow-ups)
-- ============================================================
create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) between 1 and 200),
  kind text not null default 'call' check (kind in ('call', 'text', 'email', 'showing', 'other')),
  -- Date-only, like "call back Thursday": overdue means before today in New
  -- York, never "it is 3:05 and the task said 3:00".
  due_on date not null,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists crm_tasks_open_due on public.crm_tasks (due_on) where completed_at is null;
create index if not exists crm_tasks_contact_idx on public.crm_tasks (contact_id);

create or replace function public.crm_tasks_sync_next()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if tg_op = 'DELETE' then
    v_ids := array[old.contact_id];
  elsif tg_op = 'UPDATE' then
    v_ids := array[old.contact_id, new.contact_id];
  else
    v_ids := array[new.contact_id];
  end if;
  -- Under a contact's cascade delete the contact is already gone and this
  -- updates nothing.
  update public.crm_contacts c set next_task_on = (
    select min(t.due_on) from public.crm_tasks t
     where t.contact_id = c.id and t.completed_at is null
  )
  where c.id = any(v_ids);
  return null;
end;
$$;

drop trigger if exists crm_tasks_sync_next on public.crm_tasks;
create trigger crm_tasks_sync_next
  after insert or update or delete on public.crm_tasks
  for each row execute function public.crm_tasks_sync_next();

-- ============================================================
-- 4. Saved smart lists
-- ============================================================
create table if not exists public.crm_smart_lists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 60),
  filters jsonb not null default '{}'::jsonb,
  position integer not null default 0
);

-- ============================================================
-- RLS: admin only. The app reads and writes with the service role from
-- admin-checked routes; these policies just keep the anon key out of renter
-- PII and match the rest of the admin tables (030).
-- ============================================================
alter table public.crm_contacts enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_smart_lists enable row level security;

drop policy if exists "crm_contacts_admin_all" on public.crm_contacts;
create policy "crm_contacts_admin_all" on public.crm_contacts for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "crm_activities_admin_all" on public.crm_activities;
create policy "crm_activities_admin_all" on public.crm_activities for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "crm_tasks_admin_all" on public.crm_tasks;
create policy "crm_tasks_admin_all" on public.crm_tasks for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "crm_smart_lists_admin_all" on public.crm_smart_lists;
create policy "crm_smart_lists_admin_all" on public.crm_smart_lists for all
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 5. RPCs
-- ============================================================

-- Distinct values for the filter menus, most common first.
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
    'assigned', coalesce((
      select jsonb_agg(jsonb_build_object('value', assigned_to, 'count', n) order by n desc)
        from (select assigned_to, count(*) n from crm_contacts
               where assigned_to is not null group by assigned_to) s
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

-- Existing contacts an import batch could match: same FUB ID, any shared
-- email, or any shared phone. The caller decides which candidates are really
-- the same person (src/lib/crm/merge.ts). A POST body, so no URL-length cap.
create or replace function public.crm_match_contacts(
  p_external_ids text[],
  p_emails text[],
  p_phones text[]
)
returns setof public.crm_contacts
language sql
stable
set search_path = public
as $$
  select * from crm_contacts
   where external_id = any(p_external_ids)
      or emails && p_emails
      or phones && p_phones;
$$;

-- Bulk edit by id. Each argument left null is left alone; p_assigned = ''
-- clears the agent. Stage moves are logged on each contact's timeline.
create or replace function public.crm_bulk_update(
  p_ids uuid[],
  p_stage text default null,
  p_add_tag text default null,
  p_remove_tag text default null,
  p_assigned text default null,
  p_actor text default null,
  p_actor_id uuid default null
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_stage is not null then
    insert into crm_activities (contact_id, kind, body, actor, created_by, meta)
    select id, 'stage', p_stage, p_actor, p_actor_id,
           jsonb_build_object('from', stage, 'to', p_stage, 'bulk', true)
      from crm_contacts
     where id = any(p_ids) and stage is distinct from p_stage;
  end if;

  update crm_contacts set
    stage = coalesce(p_stage, stage),
    assigned_to = case
      when p_assigned is null then assigned_to
      when p_assigned = '' then null
      else p_assigned end,
    tags = case
      when p_add_tag is not null and not (p_add_tag = any(tags)) then tags || p_add_tag
      when p_remove_tag is not null then array_remove(tags, p_remove_tag)
      else tags end
   where id = any(p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.crm_bulk_delete(p_ids uuid[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from crm_contacts where id = any(p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.crm_facets() from public, anon, authenticated;
revoke all on function public.crm_match_contacts(text[], text[], text[]) from public, anon, authenticated;
revoke all on function public.crm_bulk_update(uuid[], text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.crm_bulk_delete(uuid[]) from public, anon, authenticated;
grant execute on function public.crm_facets() to service_role;
grant execute on function public.crm_match_contacts(text[], text[], text[]) to service_role;
grant execute on function public.crm_bulk_update(uuid[], text, text, text, text, text, uuid) to service_role;
grant execute on function public.crm_bulk_delete(uuid[]) to service_role;
