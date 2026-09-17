-- 026: SEO — human-readable building URLs.
--
-- Every building page lived at /buildings/<uuid>. A UUID carries no keyword
-- signal, so the 247 active building pages competed for "<name> apartments"
-- with nothing in the URL, and the SERP snippet showed a 36-char hex blob.
-- Backfill a slug for every building and enforce uniqueness so the route can
-- resolve by slug and 301 the UUID form.

-- Lowercase, ASCII-fold, collapse everything non-alphanumeric to a single
-- dash. Kept IMMUTABLE so it can back a unique index expression if needed.
create or replace function public.seo_slugify(txt text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from
      regexp_replace(
        lower(
          translate(
            coalesce(txt, ''),
            'àáâãäåāăąçćĉċčèéêëēĕėęěìíîïĩīĭįıñńņňòóôõöøōŏőùúûüũūŭůűųýÿŷßæœđðþł',
            'aaaaaaaaaccccceeeeeeeeeiiiiiiiiinnnnooooooooouuuuuuuuuuyyysaodtl'
          )
        ),
        '[^a-z0-9]+', '-', 'g'
      )
    ),
    ''
  );
$$;

alter table public.buildings add column if not exists slug text;

-- Backfill in one pass:
--   base = slugify(name), or slugify(name || ' ' || city) when the bare name
--          slugifies to nothing or to digits only ("8119" -> "8119-miami").
--   collisions get the city appended, then a numeric suffix, so the result is
--   deterministic and stable across re-runs.
with candidate as (
  select
    b.id,
    coalesce(public.seo_slugify(b.name), 'building')                       as name_slug,
    public.seo_slugify(c.name)                                             as city_slug
  from public.buildings b
  left join public.cities c on c.id = b.city_id
  where b.slug is null
),
based as (
  select
    id,
    case
      when name_slug ~ '^[0-9-]+$' and city_slug is not null
        then name_slug || '-' || city_slug
      else name_slug
    end as base,
    city_slug
  from candidate
),
ranked as (
  select
    id,
    base,
    city_slug,
    row_number() over (partition by base order by id) as n
  from based
)
update public.buildings b
set slug = case
  when r.n = 1 then r.base
  when r.n = 2 and r.city_slug is not null and r.base not like '%' || r.city_slug || '%'
    then r.base || '-' || r.city_slug
  else r.base || '-' || r.n::text
end
from ranked r
where b.id = r.id;

-- Anything that still collided (same base, same city, >2 rows) gets the row id
-- tail so the unique index below can be created without failing.
update public.buildings b
set slug = b.slug || '-' || left(replace(b.id::text, '-', ''), 6)
where b.slug is not null
  and exists (
    select 1 from public.buildings o
    where o.slug = b.slug and o.id <> b.id
  );

create unique index if not exists buildings_slug_key on public.buildings (slug)
  where slug is not null;

-- New rows must get a slug too, or they'd silently fall back to UUID URLs.
create or replace function public.buildings_set_slug()
returns trigger
language plpgsql
as $$
declare
  base text;
  candidate text;
  i int := 1;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;

  base := coalesce(public.seo_slugify(new.name), 'building');
  if base ~ '^[0-9-]+$' then
    base := base || '-' || coalesce(
      (select public.seo_slugify(c.name) from public.cities c where c.id = new.city_id),
      'apartments'
    );
  end if;

  candidate := base;
  while exists (select 1 from public.buildings where slug = candidate) loop
    i := i + 1;
    candidate := base || '-' || i::text;
  end loop;

  new.slug := candidate;
  return new;
end;
$$;

drop trigger if exists buildings_set_slug_trg on public.buildings;
create trigger buildings_set_slug_trg
  before insert on public.buildings
  for each row execute function public.buildings_set_slug();

-- The slug is the lookup key on every building page request.
create index if not exists buildings_slug_active_idx
  on public.buildings (slug) where status = 'active';
