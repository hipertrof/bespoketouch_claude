-- BespokeTouch — narrow profiles_account_read to the role model 0015 applied to
-- memberships.
--
-- ⚠️ APPLY-AND-TEST: applied by hand via the Supabase dashboard/CLI; RLS can't
-- be exercised by this repo's build. After applying, verify the staff dashboards
-- still work as each role: an owner and an account-wide manager still see every
-- member's name/email/phone in /staff; a location manager sees their location's
-- staff; a therapist/frontdesk login sees only its own profile.
--
-- 0006's profiles_account_read granted SELECT on a co-member's whole profile row
-- (full_name + email [0006] + phone [0008]) to ANY fellow account member, with
-- no location or role scoping — the same "leaks the full staff roster to a
-- single therapist/frontdesk login" hole 0015 fixed for memberships_self_read,
-- but on a table holding contact PII, not just the role map. This propagates
-- that fix: you may read a profile only if you may read one of that user's
-- membership rows (can_read_membership, from 0015). profiles_self_read (0001)
-- still lets everyone read their own row.

create or replace function public.can_read_profile(target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.memberships m
    where m.user_id = target_user
      and public.can_read_membership(m.account_id, m.location_id)
  );
$$;

drop policy if exists profiles_account_read on public.profiles;
create policy profiles_account_read on public.profiles
  for select using (public.can_read_profile(user_id));
