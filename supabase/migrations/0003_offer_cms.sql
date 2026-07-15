-- BespokeTouch — Phase 3a: Offer CMS access policies
-- Opens up services / service_durations / location_settings (created empty in
-- 0001) for the dashboard CMS and the kiosk read path.
--
-- Two audiences:
--   * authenticated (manager/owner/platform-admin) — full CRUD, scoped by
--     can_manage_location(); read scoped by has_location_access().
--   * anon (the kiosk) — READ-ONLY of the *active* offer. This is a temporary
--     Phase-2 bridge: the kiosk currently has no device-token identity, so it
--     reads the public offer as anon. Prices/names are already public on the
--     spa's website, so exposing the active catalogue read-only is low risk.
--     Phase 2 replaces this with device-token/service-role resolution.

-- ---------------------------------------------------------------------------
-- Active-offer helpers (SECURITY DEFINER: bypass RLS so anon policies can test
-- location/service "active" without needing anon grants on those tables).
-- ---------------------------------------------------------------------------

create or replace function public.is_active_location(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.locations where id = target and active);
$$;

create or replace function public.is_active_service(target_service uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.services s
    join public.locations l on l.id = s.location_id
    where s.id = target_service and s.active and l.active
  );
$$;

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------

create policy services_read_auth on public.services
  for select to authenticated
  using (public.has_location_access(location_id));

create policy services_write on public.services
  for all to authenticated
  using (public.can_manage_location(location_id))
  with check (public.can_manage_location(location_id));

-- Kiosk bridge (Phase 2 replaces this): anon reads active services only.
create policy services_read_anon on public.services
  for select to anon
  using (active and public.is_active_location(location_id));

-- ---------------------------------------------------------------------------
-- service_durations (scoped through the parent service's location)
-- ---------------------------------------------------------------------------

create policy service_durations_read_auth on public.service_durations
  for select to authenticated
  using (exists (
    select 1 from public.services s
    where s.id = service_id and public.has_location_access(s.location_id)
  ));

create policy service_durations_write on public.service_durations
  for all to authenticated
  using (exists (
    select 1 from public.services s
    where s.id = service_id and public.can_manage_location(s.location_id)
  ))
  with check (exists (
    select 1 from public.services s
    where s.id = service_id and public.can_manage_location(s.location_id)
  ));

create policy service_durations_read_anon on public.service_durations
  for select to anon
  using (public.is_active_service(service_id));

-- ---------------------------------------------------------------------------
-- location_settings
-- ---------------------------------------------------------------------------

create policy location_settings_read_auth on public.location_settings
  for select to authenticated
  using (public.has_location_access(location_id));

create policy location_settings_write on public.location_settings
  for all to authenticated
  using (public.can_manage_location(location_id))
  with check (public.can_manage_location(location_id));

create policy location_settings_read_anon on public.location_settings
  for select to anon
  using (public.is_active_location(location_id));

-- ---------------------------------------------------------------------------
-- Grants: anon needs table-level SELECT (RLS above still restricts to active
-- rows). authenticated already has CRUD from 0002_grants.sql.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon;
grant select on public.services          to anon;
grant select on public.service_durations to anon;
grant select on public.location_settings to anon;
