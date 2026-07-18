-- BespokeTouch — tighten two membership-related RLS grants that were wider than
-- the app's role model intends.
--
-- ⚠️ APPLY-AND-TEST: like every migration here this is applied by hand via the
-- Supabase dashboard/CLI, and RLS can't be exercised by this repo's build. After
-- applying, verify the staff dashboards still work as each role: an owner and an
-- account-wide manager still see the full roster in /staff; a location manager
-- sees their location's staff; a therapist/frontdesk login sees only itself and
-- can still read its own location's intakes/queue.
--
-- Two fixes:
--
-- 1. has_location_access treated ANY account-wide membership (location_id IS
--    NULL) as location access, regardless of role. The app requires a location
--    for therapist/frontdesk (api/_membersCore enforces it), so an account-wide
--    row for those roles should not exist — but memberships_owner_write lets an
--    owner insert one directly via REST, and it would then silently grant read
--    access to EVERY location's intakes (guest names + health notes) in the
--    account. Restrict the account-wide branch to owner/manager, matching
--    can_manage_location's shape. A location-scoped row still grants access to
--    exactly its location for any role.
--
-- 2. memberships_self_read let every account member read every membership row in
--    the account (has_account_access), leaking the full staff roster and role
--    map to a single therapist/frontdesk login. Narrow it: you may read your own
--    row always; otherwise only a platform admin, the account owner, or a
--    manager of that row's location may read it. The management check runs in a
--    SECURITY DEFINER helper so the policy never re-queries memberships inline
--    (that inline self-reference is the recursion 0004 fixed).

-- 1. Role-aware location access -------------------------------------------------

create or replace function public.has_location_access(target_location uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.memberships m
    join public.locations l on l.id = target_location
    where m.user_id = auth.uid()
      and m.account_id = l.account_id
      and (
        (m.location_id is null and m.role in ('owner', 'manager'))
        or m.location_id = target_location
      )
  );
$$;

-- 2. Scoped membership reads ----------------------------------------------------

-- True if the caller may see memberships at (account, location): platform admin,
-- the account owner, or a manager account-wide or scoped to that location.
-- SECURITY DEFINER so it bypasses RLS and can't recurse into the policy below.
create or replace function public.can_read_membership(target_account uuid, target_location uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
    or public.is_account_owner(target_account)
    or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid()
        and m.account_id = target_account
        and m.role = 'manager'
        and (m.location_id is null or m.location_id = target_location)
    );
$$;

drop policy if exists memberships_self_read on public.memberships;
create policy memberships_self_read on public.memberships
  for select using (
    user_id = auth.uid()
    or public.can_read_membership(account_id, location_id)
  );
