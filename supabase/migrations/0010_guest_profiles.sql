-- BespokeTouch — Phase 4a: opt-in guest CRM (preference memory)
--
-- The `guest_profiles` table already exists (0001). It stays STRICTLY
-- service-role-only: RLS is enabled with ZERO policies and it is deliberately
-- NOT granted to anon or authenticated (0002). Every read/write goes through
-- the /api/guest endpoint (api/_guestCore.ts), which runs with the service key
-- and authorizes by resolving an active location → account server-side. The
-- kiosk is anonymous (no JWT) — the same Phase-3 anon-bridge posture as
-- intakes_insert_anon (0005); Phase 2 device tokens replace it and add rate
-- limiting.
--
-- Privacy invariants (enforced in the endpoint, restated here):
--   * The phone number is NEVER stored raw — only phone_hash =
--     HMAC-SHA256(normalized_phone, GUEST_HASH_SECRET + account_id). The
--     per-account salt means the same phone yields a different hash per spa
--     (no cross-account correlation).
--   * `preferences` holds STRUCTURED comfort settings only (pressure, oil,
--     music, communication, warming, pillow, body-zone priority/avoid marks).
--     Free-text / health-adjacent notes (zoneNotes, generalNote) are GDPR
--     Article 9 data and are NEVER written here — they live only on the
--     ephemeral intake.
--   * Rows are subject to lazy ~18-month (540-day) expiry: a lookup that finds
--     a row older than that deletes it and reports a miss. The index below
--     supports that read and a future retention sweep.
--
-- ⚠️ Secret rotation: rotating GUEST_HASH_SECRET orphans every row (existing
--    hashes become unmatchable and can no longer be deleted by phone). Rotate
--    only together with `truncate public.guest_profiles`.

-- Keep updated_at fresh on every write (no such trigger existed before).
create or replace function public.guest_profiles_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists guest_profiles_touch_updated_at on public.guest_profiles;
create trigger guest_profiles_touch_updated_at
  before update on public.guest_profiles
  for each row execute function public.guest_profiles_touch_updated_at();

-- Supports the lazy-expiry lookup read and a future account-scoped retention job.
create index if not exists guest_profiles_last_seen_idx
  on public.guest_profiles (account_id, last_seen_at);
