-- 0014 — tokens.id is the device credential; stop exposing it to staff reads.
--
-- Found in the 2026-07-18 RLS test pass: 0011 granted SELECT on the whole
-- tokens table to authenticated, and the kiosk device token IS tokens.id
-- (see api/_deviceAuth.ts). Any account member with location access — including
-- therapist and front-desk roles — could read a live token and impersonate the
-- kiosk: write intakes/surveys and reach the CRM guest actions (lookup/forget)
-- that their own role is denied. Same-location only, but a real in-tenant
-- privilege escalation across the guest-consent boundary.
--
-- Two tightenings, defence in depth; the /kiosks dashboard needs neither id nor
-- broad access (src/lib/slots.ts selects issued_at/revoked_at/last_seen_at and
-- the page is manager-gated):
--   1. Column-level grant that EXCLUDES id — no client role can read the
--      credential itself, ever.
--   2. Policy narrowed from has_location_access to can_manage_location —
--      pairing metadata is a manager concern; therapists/front-desk lose even
--      the metadata read.

revoke select on public.tokens from authenticated;
grant select (slot_id, issued_at, revoked_at, last_seen_at)
  on public.tokens to authenticated;

drop policy if exists tokens_read_auth on public.tokens;
create policy tokens_read_auth on public.tokens
  for select to authenticated
  using (
    exists (
      select 1 from public.slots s
      where s.id = tokens.slot_id
        and public.can_manage_location(s.location_id)
    )
  );
