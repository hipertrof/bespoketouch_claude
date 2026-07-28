-- Reverts the per-therapist intake scoping added in 0017: every therapist at a
-- location should see every submitted intake for that location, not just the
-- visits they're personally assigned to. Product decision — the earlier
-- "assigned-only" restriction is no longer wanted.
--
-- ⚠️ APPLY-AND-TEST: applied by hand via the Supabase dashboard/CLI; RLS can't be
-- exercised by this repo's build. After applying, verify on /queue:
--   * a therapist sees the WHOLE location's queue (not just their own visits);
--   * owner / manager / front-desk still see the whole location queue (unchanged);
--   * a therapist tied to location A still sees NOTHING from location B
--     (has_location_access still enforces that half — QUE-3 in TEST-PLAN.md).

drop policy if exists intakes_read_auth on public.intakes;
create policy intakes_read_auth on public.intakes
  for select to authenticated
  using (public.has_location_access(location_id));

drop policy if exists intakes_update_auth on public.intakes;
create policy intakes_update_auth on public.intakes
  for update to authenticated
  using (public.has_location_access(location_id))
  with check (public.has_location_access(location_id));

-- Unused now that both policies are location-access-only; only 0017 referenced
-- them.
drop function if exists public.is_assigned_intake_therapist(jsonb);
drop function if exists public.can_view_all_intakes(uuid);
