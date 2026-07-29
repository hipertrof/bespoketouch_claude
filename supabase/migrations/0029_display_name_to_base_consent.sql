-- 0029: move the guest's display name from the marketing tier down to BASE
-- consent (api/_guestCore.ts — BASE_CONSENT_VERSION v4, MARKETING v6).
--
-- No DDL. display_name was never constrained to marketing_consent_version at
-- the DB level; that invariant lived only in application code, so the tier
-- change needs no schema work. This migration exists to correct the column
-- comments 0025 left behind — they now describe the wrong tier — so the live
-- schema keeps documenting itself accurately.
--
-- Consent tiers after this change:
--   base      -> structured comfort prefs + display_name
--   health    -> zones + zoneNotes + generalNote (Art. 9), requires base
--   marketing -> contact_phone / contact_email / birthday + permission to
--                CONTACT the guest, requires base
--
-- Why the name moved: a profile the spa cannot identify is one it cannot
-- search and cannot honour an Art. 15/17 request against. Withholding the
-- name left the full behavioural profile (visits, spend, treatments,
-- therapist) in place while making the guest's own rights HARDER to exercise
-- — the opposite of what the split was for. Recognising a returning guest is
-- part of remembering them, not an act of marketing. Opting out stays a clean
-- binary: base consent off deletes the row entirely.
--
-- 0026's finding still holds — "we remember your name but may not contact
-- you" is not a state guests care to distinguish — but the fix was to merge
-- the name DOWN into base rather than up into marketing. Do not re-add a
-- separate identity tier.
--
-- No backfill, deliberately. The pre-v4 base copy did not mention the name,
-- so older rows did not consent to it under this tier — and they have no name
-- stored anyway (it was nulled), so there is nothing to legitimise after the
-- fact. Rows that DO carry a name got it under the old marketing copy, which
-- covered storing it, so they stay lawful exactly as they are. Nameless rows
-- heal on the guest's next visit, and the 540-day lazy expiry ages out the
-- rest.

comment on column public.guest_profiles.display_name is
  'Guest display name. BASE-consent tier since 2026-07-v4-base: present whenever the profile is, independent of the marketing tier. Null only when no name was ever captured.';

comment on column public.guest_profiles.marketing_consent_version is
  'Consent version for storing raw contact details (contact_phone, contact_email, birthday) AND permission to CONTACT the guest. Requires base consent. Null = those three columns must all be null. Sending is not implemented yet.';

comment on column public.guest_profiles.contact_phone is
  'Raw normalized phone, marketing-consented only. Outreach data — phone_hash remains the sole lookup key.';
