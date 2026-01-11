-- =========================
-- Unit Images Table
-- =========================
-- Stores multiple photos per unit (interior shots, views, etc.)

create table if not exists public.unit_images (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,

  url text not null,
  alt_text text,
  category text check (category in ('interior', 'kitchen', 'bathroom', 'bedroom', 'living', 'view', 'other')),
  is_primary boolean not null default false,
  sort_order int not null default 0,

  width int,
  height int,

  created_at timestamptz not null default now()
);

create index if not exists unit_images_unit_id_idx on public.unit_images(unit_id);
create index if not exists unit_images_is_primary_idx on public.unit_images(is_primary) where is_primary = true;

-- Ensure only one primary image per unit
create unique index if not exists unit_images_unit_id_primary_idx
  on public.unit_images(unit_id)
  where is_primary = true;

-- =========================
-- Building Images Table
-- =========================
-- Stores multiple photos per building (exterior, amenities, lobby, etc.)

create table if not exists public.building_images (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,

  url text not null,
  alt_text text,
  category text check (category in ('exterior', 'lobby', 'amenity', 'pool', 'gym', 'rooftop', 'common', 'other')),
  is_primary boolean not null default false,
  sort_order int not null default 0,

  width int,
  height int,

  created_at timestamptz not null default now()
);

create index if not exists building_images_building_id_idx on public.building_images(building_id);
create index if not exists building_images_is_primary_idx on public.building_images(is_primary) where is_primary = true;

-- Ensure only one primary image per building
create unique index if not exists building_images_building_id_primary_idx
  on public.building_images(building_id)
  where is_primary = true;

-- =========================
-- RLS Policies
-- =========================

-- Unit images: public read, admin write
alter table public.unit_images enable row level security;

create policy "unit_images_select_public" on public.unit_images
  for select using (true);

create policy "unit_images_insert_admin" on public.unit_images
  for insert with check (public.is_admin());

create policy "unit_images_update_admin" on public.unit_images
  for update using (public.is_admin());

create policy "unit_images_delete_admin" on public.unit_images
  for delete using (public.is_admin());

-- Building images: public read, admin write
alter table public.building_images enable row level security;

create policy "building_images_select_public" on public.building_images
  for select using (true);

create policy "building_images_insert_admin" on public.building_images
  for insert with check (public.is_admin());

create policy "building_images_update_admin" on public.building_images
  for update using (public.is_admin());

create policy "building_images_delete_admin" on public.building_images
  for delete using (public.is_admin());
