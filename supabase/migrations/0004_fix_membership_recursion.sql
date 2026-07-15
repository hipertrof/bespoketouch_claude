-- BespokeTouch — fix: infinite recursion in memberships RLS.
--
-- The Phase 1 policies `memberships_owner_write` and `locations_write` tested
-- ownership with an INLINE `exists (select 1 from public.memberships ...)`.
-- Because `memberships_owner_write` is FOR ALL, it also governs SELECTs on
-- memberships — so any access to memberships evaluated a policy that itself
-- queried memberships, recursing forever ("infinite recursion detected in
-- policy for relation memberships"). It only surfaced when creating a location
-- (the first write whose policy walks memberships); platform-admin account
-- creation only checks the is_platform_admin() flag, so it never tripped.
--
-- Fix: move the owner check into a SECURITY DEFINER helper. Definer functions
-- run as the table owner and bypass RLS, so the self-reference no longer
-- re-enters the policy. This mirrors is_platform_admin() / has_account_access().

create or replace function public.is_account_owner(target_account uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.account_id = target_account
      and m.role = 'owner'
      and m.location_id is null
  );
$$;

-- Rebuild the two offending policies to use the helper (no inline memberships
-- query, so no recursion).

drop policy if exists locations_write on public.locations;
create policy locations_write on public.locations
  for all to authenticated
  using (public.is_platform_admin() or public.is_account_owner(account_id))
  with check (public.is_platform_admin() or public.is_account_owner(account_id));

drop policy if exists memberships_owner_write on public.memberships;
create policy memberships_owner_write on public.memberships
  for all to authenticated
  using (public.is_platform_admin() or public.is_account_owner(account_id))
  with check (public.is_platform_admin() or public.is_account_owner(account_id));
