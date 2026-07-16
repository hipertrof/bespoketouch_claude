-- BespokeTouch — Phase 2: pairing / device model (full core)
--
-- The slots / tokens / pair_codes tables already exist (0001). This migration
-- opens the read paths the manager "Kiosks" dashboard needs, and keeps the
-- secret-bearing paths server-side.
--
-- Trust model:
--   * slots  — a named billable device entry per location. authenticated may
--     READ their location's slots (dashboard list); all WRITES (create/revoke)
--     go through the service-role /api/pairing endpoint, which enforces the
--     hard cap (active slots <= accounts.slots_paid) and the re-pair rate limit.
--   * tokens — the opaque key a paired tablet stores. authenticated may READ
--     (to show last_seen_at); writes are service-role only (via /api/device
--     pair/validate/heartbeat and /api/pairing repair/revoke).
--   * pair_codes — the 6-digit activation codes. SECRETS: never granted to any
--     client role. Created + consumed only by the service-role endpoints; the
--     plaintext code is returned exactly once from createSlot/repair.
--
-- The kiosk (/api/device) is anonymous and runs as service role in the endpoint,
-- so no anon RLS is added here — codes/tokens never cross the anon client.

-- ---------------------------------------------------------------------------
-- slots: authenticated READ scoped to accessible locations. No write policy →
-- authenticated cannot write (0002 granted the privilege, but RLS denies with
-- no policy). Writes happen service-side.
-- ---------------------------------------------------------------------------

create policy slots_read_auth on public.slots
  for select to authenticated
  using (public.has_location_access(location_id));

-- ---------------------------------------------------------------------------
-- tokens: authenticated READ for slots they can access (dashboard last_seen).
-- Not granted in 0002 — grant SELECT here; writes stay service-role only.
-- ---------------------------------------------------------------------------

grant select on public.tokens to authenticated;

create policy tokens_read_auth on public.tokens
  for select to authenticated
  using (
    exists (
      select 1 from public.slots s
      where s.id = tokens.slot_id
        and public.has_location_access(s.location_id)
    )
  );

-- pair_codes: intentionally NO grant + NO policy — remains deny-all for every
-- client role. Only the service role (which bypasses RLS) touches it.

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists tokens_slot_idx on public.tokens (slot_id);
create index if not exists pair_codes_slot_idx on public.pair_codes (slot_id);
-- Hard-cap counting: active slots per account.
create index if not exists slots_account_status_idx on public.slots (account_id, status);
