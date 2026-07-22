-- BespokeTouch — intake lifecycle: Article 9 scrub on 'done' + 24h auto-done.
--
-- An intake legitimately carries free-text health notes (zoneNotes,
-- generalNote) and body-map zone marks for the therapist handoff. Its
-- protection model is SHORT RETENTION, not refusal (see api/_intakeCore.ts) —
-- but until now nothing enforced it: rows kept their sensitive payload
-- forever. This migration makes 'done' the retention boundary:
--
--   * A trigger scrubs zoneNotes / generalNote / zones out of
--     `personalizations` the moment status flips to 'done' — one choke point
--     covering the /queue button, the survey auto-done PATCH, and the cron
--     sweep alike. No writer can flip a row to done without the scrub.
--   * A pg_cron job (hourly) flips any intake still not done after 24h, so
--     abandoned/never-surveyed check-ins hit the same boundary.
--
-- After 'done' the row STAYS (the /queue archive shows who came, what
-- treatment, comfort prefs); only the health-sensitive keys are gone. The
-- consented guest-CRM profile (guest_profiles, Phase 4a + consent v2) is the
-- sole lawful long-term store for zones and notes.
--
-- Re-runnable: every statement is idempotent.

-- ---------------------------------------------------------------------------
-- 1. Scrub function + trigger. `personalizations` is a jsonb ARRAY (one
--    element per guest, shape PersonalizationState); blank the sensitive keys
--    in each element. BEFORE UPDATE so the scrubbed value is what lands.
--
--    Overwrite with empty defaults rather than deleting the keys: the client
--    type (PersonalizationState) declares zoneNotes/generalNote/zones as
--    REQUIRED, non-optional fields, and the queue's IntakePanel reads them
--    with no null-guards (Object.entries(activeGuest.zoneNotes),
--    activeGuest.generalNote.trim()). Deleting the keys would crash the
--    archive detail view; blanking them keeps the shape the frontend expects.
-- ---------------------------------------------------------------------------

create or replace function public.scrub_intake_health_data()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and new.personalizations is not null
     and jsonb_typeof(new.personalizations) = 'array' then
    select coalesce(
             jsonb_agg(
               elem || jsonb_build_object('zoneNotes', '{}'::jsonb, 'generalNote', '', 'zones', '{}'::jsonb)
             ),
             '[]'::jsonb
           )
      into new.personalizations
      from jsonb_array_elements(new.personalizations) as elem;
  end if;
  return new;
end;
$$;

drop trigger if exists intakes_scrub_on_done on public.intakes;
create trigger intakes_scrub_on_done
  before insert or update of status, personalizations on public.intakes
  for each row
  execute function public.scrub_intake_health_data();

-- Note: the trigger fires on any write while status = 'done' (not just the
-- transition), so a client can't re-attach notes to an archived row, and a
-- reopened-then-redone row is re-scrubbed (a no-op — the keys are gone).

-- ---------------------------------------------------------------------------
-- 2. One-shot: scrub everything already done, and everything already past the
--    24h line, so no pre-migration row keeps sensitive data.
-- ---------------------------------------------------------------------------

update public.intakes
   set status = 'done'
 where status <> 'done'
   and created_at < now() - interval '24 hours';

-- Rows that were already 'done' before the trigger existed: force a scrub by
-- touching them (the trigger rewrites personalizations because status='done').
update public.intakes
   set status = 'done'
 where status = 'done';

-- ---------------------------------------------------------------------------
-- 3. Hourly sweep: auto-done anything older than 24h. The trigger scrubs.
--    pg_cron is available on Supabase; `schedule` upserts by job name.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

select cron.schedule(
  'intakes-auto-done-24h',
  '17 * * * *',
  $$update public.intakes set status = 'done'
     where status <> 'done' and created_at < now() - interval '24 hours'$$
);
