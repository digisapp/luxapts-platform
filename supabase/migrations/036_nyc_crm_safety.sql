-- =========================
-- Migration 036: NYC contacts — nothing lost by accident
-- Idempotent — safe to run more than once.
--
-- 1. Recoverable delete: deleting moves a contact to "Recently deleted"
--    (deleted_at). "Delete forever" exists only there.
-- 2. Undoable merge: merging hides the duplicate (merged_into) instead of
--    deleting it. Its history stays on its own row and shows on the person
--    kept; crm_merges records what the merge changed so "Undo merge" puts
--    both back. Nothing merges unless the admin picks the pair.
-- 3. Duplicate suggestions: contacts sharing an email or phone, with
--    "very likely" (first names agree) vs "check carefully" (different
--    first names: a couple or roommates on one phone). A value shared by
--    4+ contacts is an office or forwarding line, not a person, and is
--    ignored. "Not the same person" is remembered.
-- 4. Agent tags: FUB tags naming the old agents and team inboxes move out
--    of tags into extra."Agent tags" (kept, just not a filter).
-- =========================

alter table public.crm_contacts add column if not exists deleted_at timestamptz;
alter table public.crm_contacts add column if not exists merged_into uuid
  references public.crm_contacts(id) on delete set null;
alter table public.crm_contacts add column if not exists merged_at timestamptz;
alter table public.crm_contacts add column if not exists is_active boolean
  generated always as (deleted_at is null and merged_into is null) stored;

create index if not exists crm_contacts_is_active_idx on public.crm_contacts (is_active);
create index if not exists crm_contacts_merged_into_idx on public.crm_contacts (merged_into)
  where merged_into is not null;
create index if not exists crm_contacts_deleted_idx on public.crm_contacts (deleted_at)
  where deleted_at is not null;

create table if not exists public.crm_merges (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  keep_id uuid not null references public.crm_contacts(id) on delete cascade,
  merged_id uuid not null references public.crm_contacts(id) on delete cascade,
  -- The kept contact's fields before the merge, for Undo.
  keep_before jsonb not null,
  moved_task_ids uuid[] not null default '{}',
  -- Contacts that had been merged into the merged one, now pointing at keep.
  repointed_ids uuid[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  undone_at timestamptz
);
create index if not exists crm_merges_keep_idx on public.crm_merges (keep_id);
create index if not exists crm_merges_merged_idx on public.crm_merges (merged_id);

create table if not exists public.crm_duplicate_dismissals (
  a uuid not null references public.crm_contacts(id) on delete cascade,
  b uuid not null references public.crm_contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);

alter table public.crm_merges enable row level security;
alter table public.crm_duplicate_dismissals enable row level security;
drop policy if exists "crm_merges_admin_all" on public.crm_merges;
create policy "crm_merges_admin_all" on public.crm_merges for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "crm_duplicate_dismissals_admin_all" on public.crm_duplicate_dismissals;
create policy "crm_duplicate_dismissals_admin_all" on public.crm_duplicate_dismissals for all
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- Name key, as nameKey() in src/lib/crm/normalize.ts: letters only, lower.
-- ------------------------------------------------------------
create or replace function public.crm_name_key(p text)
returns text
language sql
immutable
as $$ select regexp_replace(lower(coalesce(p, '')), '[^[:alpha:]]', '', 'g') $$;

-- ------------------------------------------------------------
-- 4. Agent tags. "Agents" = everyone who was a contact's Assigned To
--    (now previous_agent) or sent an imported text or call.
-- ------------------------------------------------------------
with agents as (
  select distinct public.crm_name_key(previous_agent) k from public.crm_contacts where previous_agent is not null
  union
  select distinct public.crm_name_key(actor) from public.crm_activities
   where direction = 'outbound' and import_key is not null and actor is not null
),
moved as (
  select c.id,
         array(select t from unnest(c.tags) with ordinality u(t, o)
                where public.crm_name_key(t) in (select k from agents) order by o) as agent_tags,
         array(select t from unnest(c.tags) with ordinality u(t, o)
                where public.crm_name_key(t) not in (select k from agents) order by o) as kept
    from public.crm_contacts c
   where exists (select 1 from unnest(c.tags) t where public.crm_name_key(t) in (select k from agents))
)
update public.crm_contacts c
   set tags = m.kept,
       extra = c.extra || jsonb_build_object(
         'Agent tags',
         concat_ws(', ', nullif(c.extra->>'Agent tags', ''), array_to_string(m.agent_tags, ', '))
       )
  from moved m
 where c.id = m.id;

-- ------------------------------------------------------------
-- Facets count only contacts that are in the book.
-- ------------------------------------------------------------
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
    ), '[]'::jsonb)
  );
$$;

-- ------------------------------------------------------------
-- 1. Delete is recoverable; forever only from Recently deleted.
-- ------------------------------------------------------------
create or replace function public.crm_bulk_delete(p_ids uuid[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  update crm_contacts set deleted_at = now()
   where id = any(p_ids) and deleted_at is null and merged_into is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.crm_bulk_restore(p_ids uuid[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  update crm_contacts set deleted_at = null where id = any(p_ids) and deleted_at is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Only contacts already in Recently deleted, together with anyone merged
-- into them (the same person's other record).
create or replace function public.crm_purge_deleted(p_ids uuid[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
  v_ids uuid[];
begin
  select array_agg(id) into v_ids from crm_contacts where id = any(p_ids) and deleted_at is not null;
  if v_ids is null then
    return 0;
  end if;
  delete from crm_contacts where merged_into = any(v_ids);
  delete from crm_contacts where id = any(v_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- 3. Duplicate suggestions
-- ------------------------------------------------------------
create or replace function public.crm_duplicate_pairs(
  p_confidence text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with vals as (
    select c.id, v.value from crm_contacts c, unnest(c.emails) v(value)
     where c.is_active and v.value !~ '@(renthop-mail\.com|email\.rent\.com)$'
    union all
    select c.id, v.value from crm_contacts c, unnest(c.phones) v(value)
     where c.is_active
  ),
  shared as (
    select value, array_agg(distinct id) ids from vals group by value
    having count(distinct id) between 2 and 3
  ),
  pairs as (
    select a, b, array_agg(distinct s.value) shared
      from shared s, unnest(s.ids) a, unnest(s.ids) b
     where a < b
     group by a, b
  ),
  scored as (
    select p.a, p.b, p.shared,
           (crm_name_key(ca.first_name) = '' or crm_name_key(cb.first_name) = ''
             or crm_name_key(ca.first_name) = crm_name_key(cb.first_name)) as names_agree,
           greatest(ca.last_activity_at, cb.last_activity_at) as recent
      from pairs p
      join crm_contacts ca on ca.id = p.a
      join crm_contacts cb on cb.id = p.b
     where not exists (select 1 from crm_duplicate_dismissals d where d.a = p.a and d.b = p.b)
  ),
  chosen as (
    select * from scored
     where p_confidence is null
        or (p_confidence = 'high' and names_agree)
        or (p_confidence = 'check' and not names_agree)
  ),
  page as (
    select * from chosen order by names_agree desc, recent desc nulls last, a, b
     limit p_limit offset p_offset
  ),
  summary as (
    select c.id, jsonb_build_object(
      'id', c.id, 'first_name', c.first_name, 'last_name', c.last_name,
      'emails', c.emails, 'phones', c.phones, 'stage', c.stage, 'kind', c.kind,
      'source', c.source, 'previous_agent', c.previous_agent, 'added_at', c.added_at,
      'property_address', c.property_address, 'neighborhood', c.neighborhood,
      'price', c.price, 'beds', c.beds, 'do_not_contact', c.do_not_contact,
      'last_activity_at', c.last_activity_at, 'last_inbound_at', c.last_inbound_at,
      'external_id', c.external_id,
      'history', (select count(*) from crm_activities x where x.contact_id = c.id),
      'open_tasks', (select count(*) from crm_tasks t where t.contact_id = c.id and t.completed_at is null)
    ) as j
      from crm_contacts c
     where c.id in (select a from page union select b from page)
  )
  select jsonb_build_object(
    'high', (select count(*) from scored where names_agree),
    'check', (select count(*) from scored where not names_agree),
    'pairs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'a', (select j from summary where id = p.a),
               'b', (select j from summary where id = p.b),
               'shared', p.shared,
               'names_agree', p.names_agree)
             order by p.names_agree desc, p.recent desc nulls last, p.a, p.b)
        from page p
    ), '[]'::jsonb)
  );
$$;

-- ------------------------------------------------------------
-- 2. Merge and undo
-- ------------------------------------------------------------
create or replace function public.crm_merge_contacts(p_keep uuid, p_merge uuid, p_actor uuid default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  k crm_contacts;
  m crm_contacts;
  v_id uuid := gen_random_uuid();
  v_tasks uuid[];
  v_children uuid[];
begin
  if p_keep = p_merge then
    raise exception 'A contact cannot be merged with itself';
  end if;
  select * into k from crm_contacts where id = p_keep for update;
  select * into m from crm_contacts where id = p_merge for update;
  if k.id is null or m.id is null then
    raise exception 'Contact not found';
  end if;
  if not k.is_active or not m.is_active then
    raise exception 'Only contacts in the book can be merged (not deleted or already merged)';
  end if;

  update crm_contacts set
    emails = (array(select e from unnest(k.emails || m.emails) with ordinality u(e, o)
                     group by e order by min(o)))[1:10],
    phones = (array(select p from unnest(k.phones || m.phones) with ordinality u(p, o)
                     group by p order by min(o)))[1:10],
    tags = (array(select t from unnest(k.tags || m.tags) with ordinality u(t, o)
                   group by t order by min(o)))[1:50],
    first_name = coalesce(k.first_name, m.first_name),
    last_name = coalesce(k.last_name, m.last_name),
    source = coalesce(k.source, m.source),
    previous_agent = coalesce(k.previous_agent, m.previous_agent),
    price = coalesce(k.price, m.price),
    beds = coalesce(k.beds, m.beds),
    move_in = coalesce(k.move_in, m.move_in),
    property_address = coalesce(k.property_address, m.property_address),
    property_city = coalesce(k.property_city, m.property_city),
    property_state = coalesce(k.property_state, m.property_state),
    property_link = coalesce(k.property_link, m.property_link),
    neighborhood = coalesce(k.neighborhood, m.neighborhood),
    added_at = least(k.added_at, m.added_at),
    contacted = k.contacted or m.contacted,
    last_contacted_at = greatest(k.last_contacted_at, m.last_contacted_at),
    last_inbound_at = greatest(k.last_inbound_at, m.last_inbound_at),
    last_activity_at = greatest(k.last_activity_at, m.last_activity_at),
    -- An opt-out on either record is an opt-out for the person.
    do_not_contact = k.do_not_contact or m.do_not_contact,
    stage = case when k.stage = 'Lead' then m.stage else k.stage end
  where id = p_keep;

  with moved as (
    update crm_tasks set contact_id = p_keep
     where contact_id = p_merge and completed_at is null
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_tasks from moved;

  with repointed as (
    update crm_contacts set merged_into = p_keep where merged_into = p_merge returning id
  )
  select coalesce(array_agg(id), '{}') into v_children from repointed;

  update crm_contacts set merged_into = p_keep, merged_at = now() where id = p_merge;

  insert into crm_merges (id, keep_id, merged_id, keep_before, moved_task_ids, repointed_ids, created_by)
  values (v_id, p_keep, p_merge, to_jsonb(k), v_tasks, v_children, p_actor);

  -- A timeline entry on the kept contact (import_key: no trigger, not deletable).
  insert into crm_activities (contact_id, kind, body, import_key, created_by, meta)
  values (
    p_keep, 'note',
    'Merged with ' || coalesce(nullif(concat_ws(' ', m.first_name, m.last_name), ''), m.emails[1], m.phones[1], 'another record'),
    'merge:' || v_id, p_actor,
    jsonb_build_object('merge_id', v_id, 'merged_id', p_merge)
  );
  return v_id;
end;
$$;

-- Puts both contacts back. Anything changed on the kept contact since the
-- merge stays: a field goes back only if it still holds what the merge put
-- there, and only values that came from the merged record are removed.
create or replace function public.crm_undo_merge(p_merge_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  r crm_merges;
  b crm_contacts;   -- the kept contact as it was before the merge
  k crm_contacts;
  m crm_contacts;
begin
  select * into r from crm_merges where id = p_merge_id and undone_at is null for update;
  if r.id is null then
    raise exception 'This merge was already undone';
  end if;
  b := jsonb_populate_record(null::crm_contacts, r.keep_before);
  select * into k from crm_contacts where id = r.keep_id for update;
  select * into m from crm_contacts where id = r.merged_id for update;

  update crm_contacts set
    emails = array(select e from unnest(k.emails) e where e = any(b.emails) or not e = any(m.emails)),
    phones = array(select p from unnest(k.phones) p where p = any(b.phones) or not p = any(m.phones)),
    tags = array(select t from unnest(k.tags) t where t = any(b.tags) or not t = any(m.tags)),
    first_name = case when b.first_name is null and k.first_name is not distinct from m.first_name then null else k.first_name end,
    last_name = case when b.last_name is null and k.last_name is not distinct from m.last_name then null else k.last_name end,
    source = case when b.source is null and k.source is not distinct from m.source then null else k.source end,
    previous_agent = case when b.previous_agent is null and k.previous_agent is not distinct from m.previous_agent then null else k.previous_agent end,
    price = case when b.price is null and k.price is not distinct from m.price then null else k.price end,
    beds = case when b.beds is null and k.beds is not distinct from m.beds then null else k.beds end,
    move_in = case when b.move_in is null and k.move_in is not distinct from m.move_in then null else k.move_in end,
    property_address = case when b.property_address is null and k.property_address is not distinct from m.property_address then null else k.property_address end,
    property_city = case when b.property_city is null and k.property_city is not distinct from m.property_city then null else k.property_city end,
    property_state = case when b.property_state is null and k.property_state is not distinct from m.property_state then null else k.property_state end,
    property_link = case when b.property_link is null and k.property_link is not distinct from m.property_link then null else k.property_link end,
    neighborhood = case when b.neighborhood is null and k.neighborhood is not distinct from m.neighborhood then null else k.neighborhood end,
    added_at = case when k.added_at is not distinct from least(b.added_at, m.added_at) then b.added_at else k.added_at end,
    -- Touched since the merge (on the kept record) stays touched.
    contacted = b.contacted or coalesce(k.contacted and k.last_contacted_at > r.created_at, false),
    last_contacted_at = case when k.last_contacted_at is not distinct from greatest(b.last_contacted_at, m.last_contacted_at) then b.last_contacted_at else k.last_contacted_at end,
    last_inbound_at = case when k.last_inbound_at is not distinct from greatest(b.last_inbound_at, m.last_inbound_at) then b.last_inbound_at else k.last_inbound_at end,
    last_activity_at = case when k.last_activity_at is not distinct from greatest(b.last_activity_at, m.last_activity_at) then b.last_activity_at else k.last_activity_at end,
    do_not_contact = case when not b.do_not_contact and m.do_not_contact then false else k.do_not_contact end,
    stage = case when b.stage = 'Lead' and k.stage = m.stage then 'Lead' else k.stage end
  where id = r.keep_id;

  update crm_tasks set contact_id = r.merged_id
   where id = any(r.moved_task_ids) and contact_id = r.keep_id;
  update crm_contacts set merged_into = r.merged_id
   where id = any(r.repointed_ids) and merged_into = r.keep_id;
  update crm_contacts set merged_into = null, merged_at = null where id = r.merged_id;
  delete from crm_activities where contact_id = r.keep_id and import_key = 'merge:' || r.id;
  update crm_merges set undone_at = now() where id = r.id;
end;
$$;

revoke all on function public.crm_name_key(text) from public, anon, authenticated;
revoke all on function public.crm_facets() from public, anon, authenticated;
revoke all on function public.crm_bulk_delete(uuid[]) from public, anon, authenticated;
revoke all on function public.crm_bulk_restore(uuid[]) from public, anon, authenticated;
revoke all on function public.crm_purge_deleted(uuid[]) from public, anon, authenticated;
revoke all on function public.crm_duplicate_pairs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.crm_merge_contacts(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.crm_undo_merge(uuid) from public, anon, authenticated;
grant execute on function public.crm_name_key(text) to service_role;
grant execute on function public.crm_facets() to service_role;
grant execute on function public.crm_bulk_delete(uuid[]) to service_role;
grant execute on function public.crm_bulk_restore(uuid[]) to service_role;
grant execute on function public.crm_purge_deleted(uuid[]) to service_role;
grant execute on function public.crm_duplicate_pairs(text, integer, integer) to service_role;
grant execute on function public.crm_merge_contacts(uuid, uuid, uuid) to service_role;
grant execute on function public.crm_undo_merge(uuid) to service_role;
