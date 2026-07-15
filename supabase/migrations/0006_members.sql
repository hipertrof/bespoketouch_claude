-- BespokeTouch — Staff management (member invites + roles per location)
-- Adds what the /staff UI and the /api/members invite endpoint need:
--   1. profiles.email — so staff lists can show who a membership belongs to
--      (auth.users.email is not readable by the client; profiles is).
--   2. a trigger that auto-creates a profile row (with email) for every new
--      auth user, so invited staff appear immediately + email lookup works.
--   3. an account-scoped profiles read policy so co-members can see each other.
-- No new grants: profiles/memberships/locations are already granted to
-- authenticated in 0002; membership writes stay gated by memberships_owner_write.

-- ---------------------------------------------------------------------------
-- 1. profiles.email + backfill existing users
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists email text;

update public.profiles p
  set email = u.email
  from auth.users u
  where u.id = p.user_id and p.email is distinct from u.email;

-- ---------------------------------------------------------------------------
-- 2. Auto-create a profile (with email) on new auth user. SECURITY DEFINER so
--    it can write public.profiles from the auth trigger context.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Account-scoped profile reads. SECURITY DEFINER helper avoids recursive RLS
--    on memberships. Adds to (does not replace) profiles_self_read from 0001.
-- ---------------------------------------------------------------------------

create or replace function public.shares_account_with(target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.memberships m1
    join public.memberships m2 on m2.account_id = m1.account_id
    where m1.user_id = auth.uid() and m2.user_id = target_user
  );
$$;

drop policy if exists profiles_account_read on public.profiles;
create policy profiles_account_read on public.profiles
  for select
  using (public.shares_account_with(user_id));
