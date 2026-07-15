-- BespokeTouch — Phase 3c: Intake persistence + therapist queue
-- Opens the `intakes` table (created empty in 0001) for two audiences:
--   * authenticated (therapist/manager/owner/platform-admin) — READ their
--     location's intakes for the queue, and UPDATE status (e.g. mark started /
--     done). Scoped by has_location_access().
--   * anon (the kiosk) — INSERT ONLY, for an *active* location. This mirrors the
--     Phase-3a anon read bridge: the kiosk has no device-token identity yet, so
--     it writes as anon. Phase 2 replaces this with device-token/service-role
--     resolution and drops the anon insert.
--
-- Deliberately NO anon SELECT: intakes hold guest PII (names, body/health
-- notes), so the kiosk can write a visit but can never read intakes back. The
-- kiosk's own therapist view renders from in-session state, not a DB read.

-- ---------------------------------------------------------------------------
-- Staff read + status update (row access via has_location_access from 0001).
-- ---------------------------------------------------------------------------

create policy intakes_read_auth on public.intakes
  for select to authenticated
  using (public.has_location_access(location_id));

create policy intakes_update_auth on public.intakes
  for update to authenticated
  using (public.has_location_access(location_id))
  with check (public.has_location_access(location_id));

-- ---------------------------------------------------------------------------
-- Kiosk write bridge (Phase 2 replaces this): anon inserts a submitted intake
-- for an active location only. status is pinned to 'submitted' so anon can't
-- forge queue states; expires_at is left to the retention job / default.
-- ---------------------------------------------------------------------------

create policy intakes_insert_anon on public.intakes
  for insert to anon
  with check (status = 'submitted' and public.is_active_location(location_id));

-- ---------------------------------------------------------------------------
-- Grants: anon needs table-level INSERT (RLS above restricts it to active
-- locations + submitted status). authenticated already has CRUD from 0002.
-- ---------------------------------------------------------------------------

grant insert on public.intakes to anon;
