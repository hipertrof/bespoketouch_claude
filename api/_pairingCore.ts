// Shared logic for the manager pairing endpoint (create slot + code, re-pair,
// revoke), used by the Vercel function (api/pairing.ts) and the dev Vite
// middleware (vite-plugins/pairing-proxy.ts).
//
// Dependency-free plain fetch, mirroring api/_membersCore.ts. Runs with the
// SERVICE ROLE key: authenticates the caller from their JWT, then authorizes
// with the same matrix as members (platform admin / account owner / location
// manager). Enforces the HARD CAP (active slots <= accounts.slots_paid) and the
// re-pair RATE LIMIT — the billing guardrails from the monetization model.

import { randomInt } from "node:crypto";

// How long a freshly minted 6-digit code stays valid.
const CODE_TTL_MINUTES = 15;
// Minimum gap between re-pairs of one slot (anti-abuse: stops one paid slot
// being rotated across many tablets).
const REPAIR_COOLDOWN_SECONDS = 60;

export interface PairingEnv {
  url: string;
  serviceKey: string;
}

export interface PairingResult {
  status: number;
  json: unknown;
}

interface PairingBody {
  action?: string;
  locationId?: string;
  label?: string;
  slotId?: string;
}

type Headers = Record<string, string>;
type JsonRecord = Record<string, unknown>;

export async function handlePairing(
  authorization: string | undefined,
  body: PairingBody | undefined,
  env: PairingEnv,
): Promise<PairingResult> {
  const configError = checkConfig(env);
  if (configError) return configError;

  const base = env.url.replace(/\/$/, "");
  const svc = svcHeaders(env);

  // Identify the caller from their JWT.
  const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, json: { error: "Missing authorization." } };
  const caller = await getJson(`${base}/auth/v1/user`, { apikey: env.serviceKey, Authorization: `Bearer ${token}` });
  const callerId = asRecord(caller.body)?.id;
  if (!caller.ok || typeof callerId !== "string") {
    return { status: 401, json: { error: "Invalid or expired session." } };
  }

  switch (body?.action) {
    case "createSlot":
      return createSlot(callerId, body, base, svc);
    case "repair":
      return repair(callerId, body, base, svc);
    case "revoke":
      return revoke(callerId, body, base, svc);
    default:
      return { status: 400, json: { error: "Unknown or missing action." } };
  }
}

// Create a new billable slot at a location and mint its first pair code.
async function createSlot(
  callerId: string,
  body: PairingBody,
  base: string,
  svc: Headers,
): Promise<PairingResult> {
  const locationId = body.locationId;
  if (!locationId || !isUuid(locationId)) {
    return { status: 400, json: { error: "Missing or invalid location." } };
  }
  const location = asArray(
    (await getJson(`${base}/rest/v1/locations?select=id,account_id&id=eq.${locationId}`, svc)).body,
  )[0];
  if (!location) return { status: 404, json: { error: "Location not found." } };
  const accountId = String(location.account_id);

  const authorized = await canManageLocation(callerId, accountId, locationId, base, svc);
  if (!authorized) return { status: 403, json: { error: "Not authorized to manage this location." } };

  // HARD CAP: active slots across the account must stay within slots_paid.
  const account = asArray(
    (await getJson(`${base}/rest/v1/accounts?select=slots_paid&id=eq.${accountId}`, svc)).body,
  )[0];
  const slotsPaid = Number(account?.slots_paid ?? 0);
  const activeCount = asArray(
    (await getJson(`${base}/rest/v1/slots?select=id&account_id=eq.${accountId}&status=eq.active`, svc)).body,
  ).length;
  if (activeCount >= slotsPaid) {
    return {
      status: 403,
      json: { error: "slot_limit_reached", slotsPaid, activeCount },
    };
  }

  // Insert the slot.
  const slot = asArray(
    (
      await postJson(`${base}/rest/v1/slots`, { ...svc, Prefer: "return=representation" }, {
        account_id: accountId,
        location_id: locationId,
        label: typeof body.label === "string" && body.label.trim() ? body.label.trim() : null,
        status: "active",
      })
    ).body,
  )[0];
  const slotId = slot?.id;
  if (typeof slotId !== "string") {
    return { status: 500, json: { error: "Could not create the kiosk slot." } };
  }

  const code = await mintCode(String(slotId), base, svc);
  if (!code) return { status: 500, json: { error: "Could not generate a pairing code." } };
  return { status: 200, json: { slotId, code: code.code, expiresAt: code.expiresAt } };
}

// Revoke the slot's live token(s) and mint a fresh code — for a wiped browser /
// swapped tablet. No new slot consumed.
async function repair(
  callerId: string,
  body: PairingBody,
  base: string,
  svc: Headers,
): Promise<PairingResult> {
  const slot = await loadManageableSlot(callerId, body.slotId, base, svc);
  if ("error" in slot) return slot.error;

  // RATE LIMIT: block if a code for this slot was minted very recently.
  const recent = asArray(
    (
      await getJson(
        `${base}/rest/v1/pair_codes?select=created_at&slot_id=eq.${slot.id}` +
          `&order=created_at.desc&limit=1`,
        svc,
      )
    ).body,
  )[0];
  if (recent && typeof recent.created_at === "string") {
    const ageMs = Date.now() - Date.parse(recent.created_at);
    if (ageMs < REPAIR_COOLDOWN_SECONDS * 1000) {
      return { status: 429, json: { error: "re_pair_too_soon", retryAfterSeconds: REPAIR_COOLDOWN_SECONDS } };
    }
  }

  // Revoke existing live tokens for this slot.
  await fetch(`${base}/rest/v1/tokens?slot_id=eq.${slot.id}&revoked_at=is.null`, {
    method: "PATCH",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });

  const code = await mintCode(slot.id, base, svc);
  if (!code) return { status: 500, json: { error: "Could not generate a pairing code." } };
  return { status: 200, json: { code: code.code, expiresAt: code.expiresAt } };
}

// Retire a slot (frees it against the cap) and kill its tokens.
async function revoke(
  callerId: string,
  body: PairingBody,
  base: string,
  svc: Headers,
): Promise<PairingResult> {
  const slot = await loadManageableSlot(callerId, body.slotId, base, svc);
  if ("error" in slot) return slot.error;

  const now = new Date().toISOString();
  await fetch(`${base}/rest/v1/tokens?slot_id=eq.${slot.id}&revoked_at=is.null`, {
    method: "PATCH",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: now }),
  });
  const upd = await fetch(`${base}/rest/v1/slots?id=eq.${slot.id}`, {
    method: "PATCH",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ status: "revoked" }),
  });
  if (!upd.ok) return { status: 500, json: { error: `Could not revoke the kiosk (${upd.status}).` } };
  return { status: 200, json: { ok: true } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Loads a slot and checks the caller can manage its location. Returns the slot
// {id, account_id, location_id} or an error result.
async function loadManageableSlot(
  callerId: string,
  slotId: string | undefined,
  base: string,
  svc: Headers,
): Promise<{ id: string; accountId: string; locationId: string } | { error: PairingResult }> {
  if (!slotId || !isUuid(slotId)) {
    return { error: { status: 400, json: { error: "Missing or invalid slot id." } } };
  }
  const slot = asArray(
    (await getJson(`${base}/rest/v1/slots?select=id,account_id,location_id&id=eq.${slotId}`, svc)).body,
  )[0];
  if (!slot) return { error: { status: 404, json: { error: "Kiosk slot not found." } } };
  const accountId = String(slot.account_id);
  const locationId = String(slot.location_id);
  const authorized = await canManageLocation(callerId, accountId, locationId, base, svc);
  if (!authorized) {
    return { error: { status: 403, json: { error: "Not authorized to manage this kiosk." } } };
  }
  return { id: String(slot.id), accountId, locationId };
}

// Same matrix as members: platform admin, account owner, or a manager of this
// location (account-wide or location-scoped).
async function canManageLocation(
  callerId: string,
  accountId: string,
  locationId: string,
  base: string,
  svc: Headers,
): Promise<boolean> {
  const admin = asArray(
    (await getJson(`${base}/rest/v1/profiles?select=is_platform_admin&user_id=eq.${callerId}`, svc)).body,
  )[0];
  if (admin?.is_platform_admin) return true;

  const owner = asArray(
    (
      await getJson(
        `${base}/rest/v1/memberships?select=id&user_id=eq.${callerId}` +
          `&account_id=eq.${accountId}&role=eq.owner&location_id=is.null`,
        svc,
      )
    ).body,
  );
  if (owner.length > 0) return true;

  const mgr = asArray(
    (
      await getJson(
        `${base}/rest/v1/memberships?select=id&user_id=eq.${callerId}` +
          `&account_id=eq.${accountId}&role=eq.manager` +
          `&or=(location_id.is.null,location_id.eq.${locationId})`,
        svc,
      )
    ).body,
  );
  return mgr.length > 0;
}

// Insert a unique 6-digit code for a slot, retrying on the rare collision
// (code is the PK). Returns the plaintext code once.
async function mintCode(
  slotId: string,
  base: string,
  svc: Headers,
): Promise<{ code: string; expiresAt: string } | null> {
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomSixDigits();
    const r = await fetch(`${base}/rest/v1/pair_codes`, {
      method: "POST",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ code, slot_id: slotId, expires_at: expiresAt }),
    });
    if (r.ok) return { code, expiresAt };
    if (r.status !== 409) return null; // non-collision failure
  }
  return null;
}

// A pairing code is a bearer credential: whoever presents it gets a device
// token that can write intakes and probe guest profiles for the slot. Math.random
// is predictable and would let an attacker sweep/guess the 15-minute window, so
// use a CSPRNG across the full 6-digit space.
function randomSixDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function checkConfig(env: PairingEnv): PairingResult | null {
  if (!env.url || !env.serviceKey) {
    return { status: 500, json: { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY is missing." } };
  }
  const keyRole = jwtRole(env.serviceKey);
  const isPublicKey =
    env.serviceKey.startsWith("sb_publishable_") || (keyRole !== null && keyRole !== "service_role");
  if (isPublicKey) {
    return {
      status: 500,
      json: {
        error:
          "SUPABASE_SERVICE_ROLE_KEY looks like a public key, not the secret service_role key. " +
          "Copy the service_role / secret key from Supabase → Project Settings → API into the env.",
      },
    };
  }
  return null;
}

function svcHeaders(env: PairingEnv): Headers {
  return { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` };
}

function isUuid(v: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(v);
}

function jwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function asRecord(v: unknown): JsonRecord | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : null;
}
function asArray(v: unknown): JsonRecord[] {
  return Array.isArray(v) ? (v as JsonRecord[]) : [];
}

async function getJson(url: string, headers: Headers): Promise<{ ok: boolean; status: number; body: unknown }> {
  const r = await fetch(url, { headers });
  const body = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body };
}

async function postJson(
  url: string,
  headers: Headers,
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const r = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body };
}
