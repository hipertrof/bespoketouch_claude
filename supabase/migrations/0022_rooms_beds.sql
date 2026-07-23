-- 0022: rooms + beds per location; per-guest room assignment on intakes.
--
-- 1. rooms / beds — location-scoped resources managed on /manage (Offer CMS).
--    Beds belong to rooms (pick a room, then a bed within it). RLS mirrors the
--    services pattern (0003): authenticated read via has_location_access(),
--    write via can_manage_location(). No anon grant — the kiosk reads through
--    the SECURITY DEFINER RPC below, mirroring kiosk_therapists (0009).
-- 2. intakes.room_assignments — per-guest snapshot, index-aligned with
--    guest_names/therapists. [{ roomId, roomName, bedId, bedName } | null, ...]
--    Names are the display source (a deleted room keeps rendering); ids are
--    kept for future CRM joins. Non-sensitive — deliberately untouched by
--    0018's Article-9 scrub trigger.
-- 3. kiosk_rooms(loc) — active rooms of an active location with their active
--    beds nested, for the receptionist's assignment dropdowns on the welcome
--    step (anon kiosk) and the QR-completion modal (authenticated staff).

-- 1. Tables ------------------------------------------------------------------

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name        text not null,
  active      boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create index rooms_location_idx on public.rooms (location_id, sort);

create table public.beds (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
create index beds_room_idx on public.beds (room_id, sort);

alter table public.rooms enable row level security;
alter table public.beds  enable row level security;

create policy rooms_read_auth on public.rooms
  for select to authenticated
  using (public.has_location_access(location_id));

create policy rooms_write on public.rooms
  for all to authenticated
  using (public.can_manage_location(location_id))
  with check (public.can_manage_location(location_id));

-- Beds are scoped through their parent room's location (service_durations
-- pattern from 0003).
create policy beds_read_auth on public.beds
  for select to authenticated
  using (exists (
    select 1 from public.rooms r
    where r.id = room_id and public.has_location_access(r.location_id)
  ));

create policy beds_write on public.beds
  for all to authenticated
  using (exists (
    select 1 from public.rooms r
    where r.id = room_id and public.can_manage_location(r.location_id)
  ))
  with check (exists (
    select 1 from public.rooms r
    where r.id = room_id and public.can_manage_location(r.location_id)
  ));

-- "Automatically expose new tables" is OFF (see 0002): grants are explicit.
-- authenticated only — anon gets nothing (RPC below covers the kiosk read).
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.beds  to authenticated;

-- 2. Room assignments on intakes ---------------------------------------------

alter table public.intakes
  add column if not exists room_assignments jsonb not null default '[]'::jsonb;

-- 3. Kiosk read RPC ----------------------------------------------------------

create or replace function public.kiosk_rooms(p_location uuid)
returns table (room_id uuid, room_name text, beds jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.name,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name)
                        order by b.sort, b.name)
       from public.beds b
       where b.room_id = r.id and b.active),
      '[]'::jsonb
    )
  from public.rooms r
  join public.locations l on l.id = r.location_id and l.active
  where r.location_id = p_location and r.active
  order by r.sort, r.name;
$$;

revoke all on function public.kiosk_rooms(uuid) from public;
grant execute on function public.kiosk_rooms(uuid) to anon, authenticated;
