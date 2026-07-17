-- BespokeTouch — Phase 2 hardening: retire the anon kiosk write bridge
--
-- 0005 let the kiosk insert intakes as the `anon` role, gated only by
-- is_active_location(location_id). That was the accepted Phase-3 bridge: the
-- kiosk had no identity of its own, so the client told the server which location
-- it was writing to. The location id is not a secret — it rode in the tablet's
-- `?location=` URL and is visible in the admin UI — so anyone who had seen one
-- could insert arbitrary intakes into that spa's therapist queue, forever.
--
-- Phase 2 gave the kiosk a real identity (device token → slot → location), and
-- api/intake.ts now performs this insert with the service role AFTER resolving
-- the token. The location is derived from the token and can no longer be
-- asserted by the caller. So the anon bridge is dead weight — and an open door.
--
-- ⚠️ ORDER OF OPERATIONS: apply this only once every kiosk is paired and the
-- device-token build is deployed. A tablet still running on the old
-- `?location=` URL loses the ability to submit intakes the moment this lands.
-- (Verify: /kiosks shows every slot as paired.)
--
-- Not touched here — the anon READ bridge (0003 services, 0009 kiosk_* RPCs)
-- stays: an active location's price list is a public menu, and the kiosk needs
-- it to render before any write happens. Reads leak a price list and therapist
-- first names, not the ability to write to a queue.

-- ---------------------------------------------------------------------------
-- Drop the anon insert path. Both halves matter: the policy is what allowed the
-- row, the grant is what allowed the statement to be attempted at all.
-- ---------------------------------------------------------------------------

drop policy if exists intakes_insert_anon on public.intakes;

revoke insert on public.intakes from anon;

-- After this, `anon` has NO access to public.intakes in any direction:
-- no select (never granted — intakes hold guest PII), no insert (just revoked).
-- The only writer is the service role behind api/intake.ts, which requires a
-- live device token on an active slot. Staff reads/updates are unaffected:
-- intakes_read_auth + intakes_update_auth still scope `authenticated` by
-- has_location_access().
