-- 020: Shower availability calendar — real bookable tour slots.
--
-- Before this migration renters typed a free-form date and a coarse time
-- window, and every tour was "we'll get back to you". This adds recurring
-- weekly availability windows per shower so building pages can offer real,
-- instantly-bookable time slots (capacity = certified showers whose window
-- covers the slot, minus showings already booked at that time).
--
-- Idempotent: safe to re-run.

create table if not exists public.shower_availability (
  id uuid primary key default gen_random_uuid(),
  shower_id uuid not null references public.showers(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null check (end_time > start_time),
  created_at timestamptz not null default now(),
  unique (shower_id, day_of_week, start_time)
);

create index if not exists idx_shower_availability_shower
  on public.shower_availability(shower_id);

alter table public.shower_availability enable row level security;

drop policy if exists "shower_availability_read_own" on public.shower_availability;
create policy "shower_availability_read_own"
  on public.shower_availability for select
  using (shower_id = public.get_shower_id());

drop policy if exists "shower_availability_insert_own" on public.shower_availability;
create policy "shower_availability_insert_own"
  on public.shower_availability for insert
  with check (shower_id = public.get_shower_id());

drop policy if exists "shower_availability_update_own" on public.shower_availability;
create policy "shower_availability_update_own"
  on public.shower_availability for update
  using (shower_id = public.get_shower_id())
  with check (shower_id = public.get_shower_id());

drop policy if exists "shower_availability_delete_own" on public.shower_availability;
create policy "shower_availability_delete_own"
  on public.shower_availability for delete
  using (shower_id = public.get_shower_id());

drop policy if exists "shower_availability_admin_all" on public.shower_availability;
create policy "shower_availability_admin_all"
  on public.shower_availability for all
  using (public.is_admin())
  with check (public.is_admin());
