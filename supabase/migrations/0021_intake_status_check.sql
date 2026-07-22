-- BespokeTouch — constrain intakes.status to its three real values.
--
-- The Article-9 retention design pivots entirely on status = 'done': the 0018
-- scrub trigger blanks the health-note keys on the flip to 'done', and the
-- hourly sweep auto-flips anything status <> 'done' after 24h. But status was a
-- bare text column with no CHECK, and updateIntakeStatus() / intakes_update_auth
-- let an authenticated client write any string. A row parked in a look-alike
-- status (e.g. 'Done', 'archived') would never auto-done, never scrub, and never
-- leave the /queue Active tab — silently retaining Art-9 data indefinitely.
-- Enumerate the allowed values so the database itself rejects anything else.
--
-- Values, all set only by trusted server paths today: 'submitted' (normal kiosk
-- handoff, api/_intakeCore.ts), 'incomplete' (QR self-check-in,
-- api/_checkinCore.ts), 'done' (archive + scrub, /queue + survey + 24h sweep).
--
-- ⚠️ APPLY-AND-TEST: applied by hand. If this ALTER errors with a check
-- violation, an intake already holds a status outside the set — investigate that
-- row (it is exactly the retention-escape this guards against) before retrying.

alter table public.intakes drop constraint if exists intakes_status_check;
alter table public.intakes
  add constraint intakes_status_check
  check (status in ('submitted', 'done', 'incomplete'));
