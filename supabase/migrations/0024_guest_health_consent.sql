-- 0024: Split guest-CRM consent into base (structured comfort prefs) vs
-- health (Art. 9: marked body zones + free-text notes about them).
--
-- Until now a single consent (consent_version/consent_at) covered the
-- structured comfort preferences, the marked body zones, AND the free-text
-- notes (zoneNotes/generalNote) together — all GDPR Art. 9, since a zone mark
-- alone discloses a health-relevant area even with no text attached. From here
-- on those are two separate consents: base consent gates the profile existing
-- at all (comfort prefs only); health consent additionally gates zones +
-- zoneNotes + generalNote. A save without health consent strips all three and
-- nulls these columns, so withdrawal of health consent alone erases the
-- guest's marked zones and notes on their next visit.
--
-- Corrects a stale claim while we're here: 0001's and 0010's comments say
-- guest_profiles.preferences holds "structured prefs only (no health notes)" —
-- false since the 2026-07-v2 consent copy unlocked storing zones + notes.

alter table public.guest_profiles
  add column health_consent_version text,
  add column health_consent_at      timestamptz;

comment on column public.guest_profiles.preferences is
  'Versioned blob: structured comfort prefs (base consent) only; also zones/zoneNotes/generalNote (Art. 9) together when health_consent_version is set.';
comment on column public.guest_profiles.health_consent_version is
  'Consent version for the Art. 9 body-zone marks + free-text notes. Null = no health consent; zones/zoneNotes/generalNote must be absent from preferences.';

-- Backfill: rows saved under "2026-07-v2" opted in via consent copy that
-- explicitly named the marked areas and notes about them as health data, so
-- that single consent factually covered both. Health consent = base consent
-- for them; post-migration there is exactly one consent model and no legacy
-- rows to special-case.
-- (v1 rows have no zones/notes and correctly get no health consent.)
update public.guest_profiles
   set health_consent_version = consent_version,
       health_consent_at      = consent_at
 where consent_version = '2026-07-v2';
