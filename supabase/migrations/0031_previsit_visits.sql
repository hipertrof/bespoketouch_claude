-- BespokeTouch — pre-visit intake links (planned visits).
--
-- Until now the kiosk captured intake ONLY on-site at check-in. This adds the
-- missing "fill it in before you arrive" path without building a booking
-- system, which the product still does not have.
--
-- Reception creates a row here with exactly the fields it would otherwise type
-- on the kiosk's WelcomeStep/TreatmentStep (guest name, treatment, therapist,
-- room, bed) and gets back a link. The spa delivers that link through whatever
-- channel it already uses — there is deliberately NO sending code and no
-- e-mail/SMS sub-processor; /api/previsit returns the URL and a staffer copies
-- it, exactly as /staff already does for staff invites. The guest opens it on
-- their own device, confirms their phone, and fills in preferences and consent.
-- On arrival reception clicks once and the row becomes a normal `intakes` row.
--
-- WHY ITS OWN TABLE AND NOT AN `intakes` ROW WITH A NEW STATUS:
-- 0018's hourly job flips any intake older than 24h to 'done', and the
-- intakes_scrub_on_done trigger blanks zones/zoneNotes/generalNote when it
-- does. A link filled in three days before the appointment would reach
-- reception already wiped. Making that sweep expiry-aware would change
-- behaviour for EVERY intake, including today's; a separate table sidesteps it
-- and also avoids widening 0021's intakes_status_check enum.
--
-- WHY TIMESTAMPS AND NOT A STATUS COLUMN:
-- State is derived, never stored: created (no filled_at) -> filled -> converted
-- / revoked / expired. Every transition needs its timestamp anyway for the
-- exactly-once claim, so a status column would be a second source of truth that
-- can contradict them — and no CHECK enum to widen later, which is the mistake
-- 0021 had to patch.
--
-- TRUST MODEL — a TWO-part credential, unlike /checkin's one-part QR code.
-- This link travels over e-mail or SMS and lives for 14 days, so the bearer
-- token alone is not enough: it can be forwarded, or simply sit in an inbox.
--   1. the code   — 128 bits, stored only as sha256 (0014's lesson: the
--                   plaintext IS the credential; it exists once, in the link).
--   2. the phone  — reception types the guest's number at mint; only its
--                   HMAC survives here, and the opener must reproduce it.
-- A wrong phone answers with the SAME generic error as an unknown code, so
-- nothing distinguishes the two, and failed_attempts locks the link at 5.
--
-- Like pair_codes / checkin_codes / guest_visits: RLS enabled, ZERO policies,
-- ZERO grants. Every read and write goes through /api/previsit.
--
-- Re-runnable: guarded with if-not-exists where possible.

create table if not exists public.previsit_visits (
  id                   uuid primary key default gen_random_uuid(),
  -- Belongs to the tenant; the account is what /api/previsit authorizes against.
  account_id           uuid not null references public.accounts (id) on delete cascade,
  location_id          uuid not null references public.locations (id) on delete cascade,

  -- Bearer half of the credential: plain SHA-256 hex of the 32-hex code, as in
  -- checkin_codes. NOT an HMAC — it needs no secret, the code is the secret.
  code_hash            text not null unique,

  -- Knowledge half: guest_profiles.phone_hash — HMAC-SHA256 of the normalized
  -- phone under GUEST_HASH_SECRET + account_id. NEVER a raw phone number.
  -- Reusing the existing pseudonym rather than inventing a second one is what
  -- lets the save find (or create) the guest's own CRM row.
  subject_ref          text not null,

  -- Reception's pre-fill, in the EXACT snapshot shapes intakes already stores
  -- (TreatmentSnapshot[], (TherapistAssignment|null)[], (RoomAssignment|null)[]),
  -- so conversion is a copy and a later service/therapist/room rename cannot
  -- rewrite history — the same name-snapshot idiom as 0009 and 0022.
  guest_name           text not null,
  treatment_selections jsonb not null default '[]'::jsonb,
  therapists           jsonb not null default '[]'::jsonb,
  room_assignments     jsonb not null default '[]'::jsonb,

  -- The guest's own answers: a one-element SubmittedPersonalization[], the same
  -- shape as intakes.personalizations. Null until they fill it in, and nulled
  -- again at conversion — after arrival the health data lives in exactly ONE
  -- place (the intake), under 0018's scrub/sweep lifecycle.
  personalizations     jsonb,
  filled_at            timestamptz,

  -- Who minted it. No FK plus a name snapshot, mirroring
  -- erasure_log.executed_by_name and guest_notes.author_name: removing a staff
  -- member must not cascade away a planned visit, and the audit trail has to
  -- stay readable. This is an audit trail /checkin's QR mint does NOT have.
  created_by           uuid not null,
  created_by_name      text not null,

  created_at           timestamptz not null default now(),
  -- 14 days, stamped server-side. Anchored to MINTING, not to an appointment
  -- date, because no appointment entity exists to anchor to.
  expires_at           timestamptz not null,
  revoked_at           timestamptz,
  -- Claimed atomically (converted_at is null) so a double-tapped arrival cannot
  -- create two intakes — the same guarantee checkin_codes.used_at gives.
  converted_at         timestamptz,
  -- No FK: intakes are volatile (0018 sweeps them), so this is a breadcrumb.
  converted_intake_id  uuid,

  -- Total opens. A hygiene metric, not a gate: bumped best-effort like
  -- checkin_codes.lookup_count, and a legitimate guest may reopen the link
  -- many times over two weeks.
  lookup_count         int not null default 0,
  -- Wrong-phone attempts. THIS one is a security control — the endpoint refuses
  -- the link past its cap — so it is bumped through the atomic RPC below rather
  -- than a read-modify-write that could lose a bump to a race.
  failed_attempts      int not null default 0
);

comment on table public.previsit_visits is
  'Planned visits with a pre-visit intake link. Reception pre-fills the staff-side intake fields and mints a 14-day two-part credential (code + phone hash); the guest fills in preferences from their own device; reception converts it to an intakes row on arrival. Service-role only — reached solely through /api/previsit.';
comment on column public.previsit_visits.subject_ref is
  'guest_profiles.phone_hash (HMAC-SHA256 under GUEST_HASH_SECRET + account_id). The second half of the credential: the opener must reproduce it. Matchable, never readable back.';
comment on column public.previsit_visits.personalizations is
  'The guest''s submitted answers, same shape as intakes.personalizations. Holds Art. 9 health data (zones/notes) only while health consent is on. Nulled at conversion and purged 24h past expiry — far tighter than the 540-day CRM retention.';

alter table public.previsit_visits enable row level security;
-- Deliberately no grant to anon/authenticated and no policies: like pair_codes
-- and checkin_codes, only the service role may touch this.

-- The staff list ("upcoming visits at this location, newest first"). Mirrors
-- intakes_location_idx.
create index if not exists previsit_visits_location_idx
  on public.previsit_visits (location_id, created_at desc);
create index if not exists previsit_visits_account_idx
  on public.previsit_visits (account_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Atomic failure counter
-- ---------------------------------------------------------------------------
-- PostgREST cannot express `set failed_attempts = failed_attempts + 1`, and a
-- read-modify-write over a 14-day window can lose a bump to a concurrent
-- attempt. checkin_codes tolerates that for lookup_count because 15 minutes is
-- too short to matter and the counter is only a metric; here the counter is the
-- brute-force lock on the phone number, so it gets a real atomic increment.
--
-- security definer because the table has no grants at all; revoked from every
-- role so only the service key can call it.
create or replace function public.previsit_register_failure(p_code_hash text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.previsit_visits
     set failed_attempts = failed_attempts + 1
   where code_hash = p_code_hash
  returning failed_attempts into n;
  return coalesce(n, 0);
end $$;

revoke all on function public.previsit_register_failure(text) from public;
revoke all on function public.previsit_register_failure(text) from anon;
revoke all on function public.previsit_register_failure(text) from authenticated;

-- ---------------------------------------------------------------------------
-- erasure_log: one more channel
-- ---------------------------------------------------------------------------
-- The pre-visit save carries the same consent semantics as /checkin's: base
-- consent switched off DELETES the guest_profiles row. That is an erasure, so
-- it needs its own channel value rather than borrowing 'checkin' — the
-- identity verification is genuinely different (a link that travelled over
-- e-mail, plus the phone the spa recorded at booking, versus a code shown on a
-- screen to someone standing in the room). Mirrored in ErasureChannel in
-- api/_erasureLog.ts.
alter table public.erasure_log drop constraint if exists erasure_log_request_channel_check;
alter table public.erasure_log
  add constraint erasure_log_request_channel_check
  check (request_channel in ('dashboard', 'consent_desk', 'kiosk', 'checkin', 'retention', 'previsit'));

-- ---------------------------------------------------------------------------
-- Purge
-- ---------------------------------------------------------------------------
-- Enforcement lives in resolveLink() in api/_previsitCore.ts, which checks
-- every timestamp before honouring a code; this job is hygiene, on the same
-- hourly rhythm as 0018/0019 (job name upserts on re-run).
--
-- The 24-hour grace is deliberate: reception should still see "arrived" and
-- "expired / no-show" on the /upcoming list for a day after the fact. A row
-- that is filled but never converted (a no-show) holds the guest's health
-- answers until then — consented data with a live purpose, deleted within a day
-- of the link lapsing.
select cron.schedule(
  'previsit-purge',
  '37 * * * *',
  $$delete from public.previsit_visits
     where converted_at < now() - interval '24 hours'
        or revoked_at   < now() - interval '24 hours'
        or expires_at   < now() - interval '24 hours'$$
);
