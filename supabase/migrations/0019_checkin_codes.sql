-- BespokeTouch — QR self-check-in codes.
--
-- Reception shows a QR minted by the paired kiosk; the guest scans it on their
-- OWN phone and lands on the anonymous /checkin page. The code in the QR is the
-- only credential that page has, so it follows the pair_codes / tokens trust
-- model:
--   * short-lived (15 min, enforced server-side in api/_checkinCore.ts);
--   * stored only as a SHA-256 hash (0014's lesson: the plaintext is the
--     credential — it exists once, in the QR, and never in the table);
--   * multi-lookup (typos) but capped, and dead after one successful save;
--   * service-role only: NO grants, NO policies. Every read/write goes through
--     /api/checkin, which derives the location from the code row — the guest's
--     phone never names a location.
--
-- Re-runnable: guarded with if-not-exists where possible.

create table if not exists public.checkin_codes (
  id           uuid primary key default gen_random_uuid(),
  code_hash    text not null unique,
  location_id  uuid not null references public.locations(id) on delete cascade,
  -- The device token (tokens.id) of the kiosk that minted the code — for audit
  -- and per-kiosk rate limiting, not a FK (a revoked token may be purged later).
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  -- Stamped by a successful save; a used code is dead for every action.
  used_at      timestamptz,
  -- Bumped on every lookup; the endpoint rejects past its cap so a leaked QR
  -- can't become a phone-probing oracle.
  lookup_count int not null default 0
);

alter table public.checkin_codes enable row level security;
-- Deliberately no grant to anon/authenticated and no policies: like pair_codes,
-- this is a secrets table only the service role may touch.

create index if not exists checkin_codes_location_idx
  on public.checkin_codes (location_id);

-- Expired rows are junk the moment they lapse; sweep them with the same hourly
-- cron rhythm 0018 established (job name upserts on re-run).
select cron.schedule(
  'checkin-codes-purge',
  '23 * * * *',
  $$delete from public.checkin_codes where expires_at < now() - interval '1 day'$$
);
