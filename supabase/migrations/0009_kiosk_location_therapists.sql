-- 0009: kiosk location identity + therapist assignment
--
-- 1. intakes.therapists — per-guest therapist assignment snapshot, index-
--    aligned with guest_names/personalizations. [{ id, name } | null, ...].
-- 2. kiosk_location_info(loc) — account + location display names for the
--    kiosk welcome headline. SECURITY DEFINER so anon never gets table-level
--    read on accounts/locations; active locations only.
-- 3. kiosk_therapists(loc) — display names of therapists assigned to a
--    location, for the receptionist's assignment dropdown. Names only (falls
--    back to the email local part when a profile has no full_name) — no
--    emails or other profile data cross the anon boundary.
--
-- Both functions are part of the Phase-3a anon kiosk bridge; Phase 2's
-- device-token identity supersedes the anon grants.

-- 1. Therapist assignments on intakes ---------------------------------------

alter table public.intakes
  add column if not exists therapists jsonb not null default '[]'::jsonb;

-- 2. Location identity for the welcome headline ------------------------------

create or replace function public.kiosk_location_info(p_location uuid)
returns table (location_name text, account_name text)
language sql
stable
security definer
set search_path = public
as $$
  select l.name, a.name
  from public.locations l
  join public.accounts a on a.id = l.account_id
  where l.id = p_location and l.active;
$$;

-- 3. Therapists assigned to a location ---------------------------------------

create or replace function public.kiosk_therapists(p_location uuid)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1))
  from public.memberships m
  join public.locations l on l.id = p_location and l.active
  left join public.profiles p on p.user_id = m.user_id
  where m.role = 'therapist'
    and m.account_id = l.account_id
    and (m.location_id = p_location or m.location_id is null)
  order by 2;
$$;

-- Execution rights: kiosk (anon) + dashboards (authenticated) only.
revoke all on function public.kiosk_location_info(uuid) from public;
revoke all on function public.kiosk_therapists(uuid) from public;
grant execute on function public.kiosk_location_info(uuid) to anon, authenticated;
grant execute on function public.kiosk_therapists(uuid) to anon, authenticated;
