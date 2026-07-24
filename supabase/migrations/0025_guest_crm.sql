-- 0025: Guest CRM expansion — identity/marketing consent tiers, durable visit
-- history, staff notes, tags, and survey linkage.
--
-- Consent model grows from two tiers (0024: base + health) to four:
--   base      -> profile exists at all (structured comfort prefs)
--   health    -> zones + zoneNotes + generalNote (Art. 9), sibling of identity
--   identity  -> display name, raw contact phone/email, optional birthday
--   marketing -> permission to CONTACT (distinct from storage; sending is a
--                later phase — modeled now so the stamp exists when it ships)
-- Nesting: health and identity each require base; marketing requires identity.
-- All stamps are server-side (api/_guestCore.ts). A save with identityConsent
-- withdrawn nulls ALL identity + marketing columns (withdrawal-erases, same
-- guarantee as the health tier).
--
-- Every new table below is SERVICE-ROLE-ONLY: RLS enabled, zero policies,
-- zero grants (the pair_codes / checkin_codes / guest_profiles pattern).
-- The staff-facing Guest 360 reads them exclusively through the authed
-- /api/crm endpoint (api/_crmCore.ts), which enforces manager-and-up itself —
-- raw contact data is never readable by any browser-side Supabase query.
--
-- Erasure: guest_visits / guest_notes / guest_tag_assignments FK
-- guest_profiles ON DELETE CASCADE, so the existing forget path (and the
-- 540-day lazy expiry) erases a guest's entire CRM footprint with no code
-- change. survey_responses.guest_id is ON DELETE SET NULL — forget reverts a
-- response to its pre-0025 pseudonymous state instead of destroying analytics.

-- ---------------------------------------------------------------------------
-- guest_profiles: identity + marketing tiers
-- ---------------------------------------------------------------------------
-- Invariant (enforced in _guestCore.ts): display_name / contact_phone /
-- contact_email / birthday / marketing_* are non-null ONLY while
-- identity_consent_version is set. phone_hash stays the ONLY lookup key —
-- contact_phone is display/marketing data, never queried by value.

alter table public.guest_profiles
  add column if not exists identity_consent_version  text,
  add column if not exists identity_consent_at       timestamptz,
  add column if not exists display_name              text,
  add column if not exists contact_phone             text,
  add column if not exists contact_email             text,
  add column if not exists birthday                  date,
  add column if not exists marketing_consent_version text,
  add column if not exists marketing_consent_at      timestamptz;

comment on column public.guest_profiles.identity_consent_version is
  'Consent version for storing real identity (name, raw contact, birthday). Null = pseudonymous hash-only row; all identity/marketing columns must be null.';
comment on column public.guest_profiles.contact_phone is
  'Raw normalized phone, identity-consented only. Display/marketing data — phone_hash remains the sole lookup key.';
comment on column public.guest_profiles.marketing_consent_version is
  'Separate opt-in to be CONTACTED (reminders/offers). Requires identity consent; no sending is implemented yet.';

-- ---------------------------------------------------------------------------
-- guest_visits: durable per-guest timeline
-- ---------------------------------------------------------------------------
-- Written by _intakeCore/_checkinCore at intake-submit time for guests with a
-- consented profile. Deliberately a NON-HEALTH snapshot (no zones/notes/
-- personalizations) — health data lives only on the scrubbed intake row.
-- intake_id has NO FK: intakes are volatile (24h sweep); it exists only so
-- submitSurvey can link a response to the guest.

create table if not exists public.guest_visits (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts (id) on delete cascade,
  location_id     uuid references public.locations (id) on delete set null,
  location_name   text not null,
  guest_id        uuid not null references public.guest_profiles (id) on delete cascade,
  intake_id       uuid,
  visited_at      timestamptz not null default now(),
  treatment_name  text,
  treatment_price numeric,
  duration_min    integer,
  therapist_id    uuid,
  therapist_name  text,
  room_name       text,
  bed_name        text,
  created_at      timestamptz not null default now()
);

create index if not exists guest_visits_guest_idx   on public.guest_visits (guest_id, visited_at desc);
create index if not exists guest_visits_intake_idx  on public.guest_visits (intake_id);
create index if not exists guest_visits_account_idx on public.guest_visits (account_id, visited_at desc);

alter table public.guest_visits enable row level security;

-- ---------------------------------------------------------------------------
-- guest_notes: staff free-text notes (Art. 6 operational data)
-- ---------------------------------------------------------------------------
-- author_name is a snapshot (survey therapist_name habit) so a departed staff
-- member's notes stay attributed. Erased with the guest via cascade. The UI
-- carries a "no health info here" hint; notes are NOT under the health tier.

create table if not exists public.guest_notes (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  guest_id    uuid not null references public.guest_profiles (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null,
  author_name text not null,
  body        text not null check (char_length(body) <= 2000),
  created_at  timestamptz not null default now()
);

create index if not exists guest_notes_guest_idx on public.guest_notes (guest_id, created_at desc);

alter table public.guest_notes enable row level security;

-- ---------------------------------------------------------------------------
-- guest_tags + guest_tag_assignments: per-account tag vocabulary
-- ---------------------------------------------------------------------------

create table if not exists public.guest_tags (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  color      text,
  created_at timestamptz not null default now(),
  unique (account_id, name)
);

create table if not exists public.guest_tag_assignments (
  guest_id   uuid not null references public.guest_profiles (id) on delete cascade,
  tag_id     uuid not null references public.guest_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (guest_id, tag_id)
);

alter table public.guest_tags enable row level security;
alter table public.guest_tag_assignments enable row level security;

-- ---------------------------------------------------------------------------
-- survey_responses: optional guest linkage
-- ---------------------------------------------------------------------------
-- Set by submitSurvey only when exactly ONE guest_visits row maps to the
-- intake (a couple's intake is ambiguous about who answered — left null).
-- Existing survey_read_manage policy governs client reads; the Guest 360
-- reads surveys through /api/crm with its own manager check.

alter table public.survey_responses
  add column if not exists guest_id uuid references public.guest_profiles (id) on delete set null;

create index if not exists survey_responses_guest_idx on public.survey_responses (guest_id);
