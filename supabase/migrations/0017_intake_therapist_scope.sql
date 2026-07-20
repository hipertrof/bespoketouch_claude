-- BespokeTouch — scope the therapist queue to a therapist's own assignments.
--
-- ⚠️ APPLY-AND-TEST: applied by hand via the Supabase dashboard/CLI; RLS can't be
-- exercised by this repo's build. After applying, verify on /queue:
--   * a therapist sees ONLY intakes where they are an assigned therapist, and
--     only for their own location(s);
--   * an owner / manager / front-desk still sees the whole location queue;
--   * marking done / reopening still works for the rows each role can see.
--
-- Before this migration intakes_read_auth / intakes_update_auth used
-- has_location_access alone, so ANY staffer at a location (a therapist included)
-- could read and status-update EVERY intake there — guest names + health notes
-- for visits assigned to a colleague. The product rule is per-therapist:
--   * owner / manager / front-desk / platform admin  → whole location queue;
--   * therapist                                       → only visits assigned to them.
--
-- intakes.therapists (0009) is a jsonb array of { id: <auth user_id>, name },
-- index-aligned with guest_names; a null entry means that guest picked no one.

-- Who may see the WHOLE location's queue: everyone with location access EXCEPT a
-- pure therapist. SECURITY DEFINER so it bypasses RLS and never recurses into
-- the intakes policy below.
create or replace function public.can_view_all_intakes(target_location uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.memberships m
    join public.locations l on l.id = target_location
    where m.user_id = auth.uid()
      and m.account_id = l.account_id
      and (
        (m.role = 'owner' and m.location_id is null)
        or (m.role in ('manager', 'frontdesk')
            and (m.location_id is null or m.location_id = target_location))
      )
  );
$$;

-- True when the caller (auth.uid()) is one of the intake's assigned therapists.
-- Operates only on the passed jsonb, so it needs no elevated rights.
create or replace function public.is_assigned_intake_therapist(assigned jsonb)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(assigned, '[]'::jsonb)) e
    where e ->> 'id' = auth.uid()::text
  );
$$;

-- Read: location access AND (full-queue visibility OR assigned to this visit).
drop policy if exists intakes_read_auth on public.intakes;
create policy intakes_read_auth on public.intakes
  for select to authenticated
  using (
    public.has_location_access(location_id)
    and (
      public.can_view_all_intakes(location_id)
      or public.is_assigned_intake_therapist(therapists)
    )
  );

-- Update (mark done / reopen): same scope, so a therapist can only act on the
-- visits they can see.
drop policy if exists intakes_update_auth on public.intakes;
create policy intakes_update_auth on public.intakes
  for update to authenticated
  using (
    public.has_location_access(location_id)
    and (
      public.can_view_all_intakes(location_id)
      or public.is_assigned_intake_therapist(therapists)
    )
  )
  with check (
    public.has_location_access(location_id)
    and (
      public.can_view_all_intakes(location_id)
      or public.is_assigned_intake_therapist(therapists)
    )
  );
