-- 0026: Collapse the identity consent tier into marketing.
--
-- 0025 added two nested tiers: identity (name/contact/birthday) and, nested
-- under it, marketing (permission to contact). In practice guests found four
-- consent decisions (base, health, identity, marketing) one too many. From
-- here on there are three: base, health, and a single marketing consent that
-- covers BOTH storing the guest's name/contact details AND permission to
-- contact them — there is no meaningful "we remember your name but may not
-- use it" state to preserve separately.
--
-- Backfill: a row that already has identity but not marketing consent
-- (stored contact info, hadn't opted into being contacted) inherits the
-- identity stamp as its marketing stamp — its name/contact were already
-- consented-to storage, so nothing new is being granted, just re-labeled.

update public.guest_profiles
   set marketing_consent_version = identity_consent_version,
       marketing_consent_at      = identity_consent_at
 where identity_consent_version is not null
   and marketing_consent_version is null;

alter table public.guest_profiles
  drop column if exists identity_consent_version,
  drop column if exists identity_consent_at;

comment on column public.guest_profiles.marketing_consent_version is
  'Single consent covering both storing the guest''s name/contact details (display_name, contact_phone, contact_email, birthday) and permission to contact them. Requires base consent. Null = no name/contact stored, no contact permission.';
