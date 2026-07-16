// Shared logic for the opt-in guest CRM endpoint, used by both the Vercel
// serverless function (api/guest.ts) and the dev Vite middleware
// (vite-plugins/guest-proxy.ts).
//
// Deliberately dependency-free — plain fetch against Supabase's REST API,
// mirroring api/_membersCore.ts. (The Supabase SDK crashed the serverless
// function with FUNCTION_INVOCATION_FAILED.) Lives in /api as an underscore-
// prefixed file so Vercel bundles it WITHOUT turning it into its own route.
//
// Runs with the SERVICE ROLE key. Unlike the members endpoint, callers are
// ANONYMOUS: the kiosk has no login/JWT, only its ?location=<id>. So this
// endpoint does not authenticate a caller — instead every action resolves the
// location to an active account server-side (mirrors intakes_insert_anon in
// 0005). No rate limiting: the accepted Phase-3 anon-bridge gap, closed by
// Phase 2 device tokens.
//
// Threat posture accepted for v1 (comfort-settings only, no PII stored):
//   * Lookup with a known phone reveals only massage preferences — no name,
//     phone, or free text is ever stored, so a hash collision/guess leaks
//     nothing identifying.
//   * Overwrite/forget by a guessed phone can only corrupt a guest's comfort
//     settings. Low harm; deferred to Phase 2 device-token identity.
// One cheap hardening kept: `save` requires consent === true and stamps
// consent_version/consent_at SERVER-side (the client can't forge them).
//
// Privacy: the raw phone exists only in the request body (HTTPS) and is hashed
// immediately — never persisted, never logged.

import { createHmac } from "node:crypto";

// Bump when the consent wording (consentSaveBody in i18n) materially changes.
export const CONSENT_VERSION = "2026-07-v1";

// ~18 months. A lookup that finds a row older than this deletes it and reports
// a miss (lazy GDPR storage-limitation; a sweep job comes later).
const EXPIRY_DAYS = 540;

export interface GuestEnv {
  url: string;
  serviceKey: string;
  hashSecret: string;
}

export interface GuestResult {
  status: number;
  json: unknown;
}

// The versioned shape stored in guest_profiles.preferences. Structured comfort
// settings ONLY — no free text, no health data. Kept in sync with the client's
// StoredPreferences (src/lib/guestProfile.ts); the server re-validates it
// structurally on save so a buggy/hostile client can't smuggle extra keys in.
export interface StoredPreferencesV1 {
  v: 1;
  pressure?: string;
  oilId?: string;
  tableWarming?: boolean;
  headrestPillow?: string;
  music?: string;
  communication?: string;
  // Body-zone marks, "priority" | "blocked" only ("standard" is the default and
  // is never stored). Zone free-text notes are deliberately excluded.
  zones?: Record<string, "priority" | "blocked">;
}

interface GuestBody {
  action?: string;
  locationId?: string;
  phone?: string;
  consent?: boolean;
  preferences?: unknown;
}

type Headers = Record<string, string>;
type JsonRecord = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Public entry — dispatches on body.action.
// ---------------------------------------------------------------------------

export async function handleGuest(
  body: GuestBody | undefined,
  env: GuestEnv,
): Promise<GuestResult> {
  const configError = checkConfig(env);
  if (configError) return configError;

  switch (body?.action) {
    case "lookup":
      return lookupGuest(body, env);
    case "save":
      return saveGuest(body, env);
    case "forget":
      return forgetGuest(body, env);
    default:
      return { status: 400, json: { error: "Unknown or missing action." } };
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function lookupGuest(body: GuestBody, env: GuestEnv): Promise<GuestResult> {
  const phone = normalizePhone(body.phone);
  if (!phone) return { status: 400, json: { error: "Invalid phone number." } };

  const base = env.url.replace(/\/$/, "");
  const svc = svcHeaders(env);
  const accountId = await resolveAccount(base, svc, body.locationId);
  if (!accountId) return { status: 403, json: { error: "Unknown or inactive location." } };

  const hash = phoneHash(phone, accountId, env.hashSecret);
  const rows = asArray(
    (
      await getJson(
        `${base}/rest/v1/guest_profiles?select=id,preferences,last_seen_at,updated_at` +
          `&account_id=eq.${accountId}&phone_hash=eq.${hash}`,
        svc,
      )
    ).body,
  );
  const row = rows[0];
  if (!row) return { status: 200, json: { found: false } };

  // Lazy expiry: a stale profile is deleted and reported as a miss.
  const seen = row.last_seen_at ?? row.updated_at;
  if (isExpired(typeof seen === "string" ? seen : null)) {
    await deleteById(base, svc, String(row.id));
    return { status: 200, json: { found: false } };
  }

  // Touch last_seen_at so an active guest's row keeps living (fire-and-forget).
  void fetch(`${base}/rest/v1/guest_profiles?id=eq.${String(row.id)}`, {
    method: "PATCH",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  }).catch(() => {});

  // Return preferences only — never the hash or any identifier.
  return { status: 200, json: { found: true, preferences: row.preferences ?? null } };
}

async function saveGuest(body: GuestBody, env: GuestEnv): Promise<GuestResult> {
  // Consent is mandatory and cannot be inferred — an explicit opt-in.
  if (body.consent !== true) {
    return { status: 400, json: { error: "Consent is required to save preferences." } };
  }
  const phone = normalizePhone(body.phone);
  if (!phone) return { status: 400, json: { error: "Invalid phone number." } };

  const preferences = sanitizePreferences(body.preferences);
  if (!preferences) return { status: 400, json: { error: "Invalid preferences payload." } };

  const base = env.url.replace(/\/$/, "");
  const svc = svcHeaders(env);
  const accountId = await resolveAccount(base, svc, body.locationId);
  if (!accountId) return { status: 403, json: { error: "Unknown or inactive location." } };

  const hash = phoneHash(phone, accountId, env.hashSecret);
  const now = new Date().toISOString();
  const upsert = await fetch(
    `${base}/rest/v1/guest_profiles?on_conflict=account_id,phone_hash`,
    {
      method: "POST",
      headers: {
        ...svc,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        account_id: accountId,
        phone_hash: hash,
        preferences,
        consent_version: CONSENT_VERSION,
        consent_at: now,
        last_seen_at: now,
      }),
    },
  );
  if (!upsert.ok) {
    return { status: 500, json: { error: `Could not save preferences (${upsert.status}).` } };
  }
  return { status: 200, json: { ok: true } };
}

async function forgetGuest(body: GuestBody, env: GuestEnv): Promise<GuestResult> {
  const phone = normalizePhone(body.phone);
  if (!phone) return { status: 400, json: { error: "Invalid phone number." } };

  const base = env.url.replace(/\/$/, "");
  const svc = svcHeaders(env);
  const accountId = await resolveAccount(base, svc, body.locationId);
  if (!accountId) return { status: 403, json: { error: "Unknown or inactive location." } };

  const hash = phoneHash(phone, accountId, env.hashSecret);
  const del = await fetch(
    `${base}/rest/v1/guest_profiles?account_id=eq.${accountId}&phone_hash=eq.${hash}`,
    { method: "DELETE", headers: { ...svc, Prefer: "return=minimal" } },
  );
  if (!del.ok) {
    return { status: 500, json: { error: `Could not delete preferences (${del.status}).` } };
  }
  // No existence oracle beyond what lookup already gives — always report ok.
  return { status: 200, json: { ok: true } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function checkConfig(env: GuestEnv): GuestResult | null {
  if (!env.url || !env.serviceKey) {
    return { status: 500, json: { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY is missing." } };
  }
  if (!env.hashSecret) {
    return { status: 500, json: { error: "Server not configured: GUEST_HASH_SECRET is missing." } };
  }
  // Guard against pasting a PUBLIC key instead of the secret one (see members).
  const keyRole = jwtRole(env.serviceKey);
  const isPublicKey =
    env.serviceKey.startsWith("sb_publishable_") || (keyRole !== null && keyRole !== "service_role");
  if (isPublicKey) {
    return {
      status: 500,
      json: {
        error:
          "SUPABASE_SERVICE_ROLE_KEY looks like a public key, not the secret service_role key. " +
          "In Supabase → Project Settings → API, copy the service_role / secret key into the env.",
      },
    };
  }
  return null;
}

function svcHeaders(env: GuestEnv): Headers {
  return { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` };
}

// Resolves a location id to its account, but ONLY for an active location — the
// same gate the anon intake-insert bridge uses. Returns null for unknown /
// inactive / missing input.
export async function resolveAccount(
  base: string,
  svc: Headers,
  locationId: string | undefined,
): Promise<string | null> {
  if (!locationId || !/^[0-9a-f-]{36}$/i.test(locationId)) return null;
  const rows = asArray(
    (
      await getJson(
        `${base}/rest/v1/locations?select=account_id&id=eq.${locationId}&active=is.true`,
        svc,
      )
    ).body,
  );
  const accountId = rows[0]?.account_id;
  return typeof accountId === "string" ? accountId : null;
}

// Normalizes to digits with an optional leading '+'. A 9-digit local number
// with no country code is assumed Polish (+48). Rejects anything under 8
// digits. This is the single source of truth — the client sends the raw value.
export function normalizePhone(raw: string | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 9) return `+48${digits}`; // bare Polish mobile/landline
  return `+${digits}`;
}

export function phoneHash(phone: string, accountId: string, secret: string): string {
  return createHmac("sha256", secret + accountId).update(phone).digest("hex");
}

// Server-side whitelist. Drops any key not in the known set and any zone value
// other than priority/blocked — structural defense so free text or health data
// can never reach the table even if a client sends it. Returns null only if the
// payload isn't an object at all.
function sanitizePreferences(input: unknown): StoredPreferencesV1 | null {
  const rec = asRecord(input);
  if (!rec) return null;

  const out: StoredPreferencesV1 = { v: 1 };
  if (typeof rec.pressure === "string") out.pressure = rec.pressure;
  if (typeof rec.oilId === "string") out.oilId = rec.oilId;
  if (typeof rec.tableWarming === "boolean") out.tableWarming = rec.tableWarming;
  if (typeof rec.headrestPillow === "string") out.headrestPillow = rec.headrestPillow;
  if (typeof rec.music === "string") out.music = rec.music;
  if (typeof rec.communication === "string") out.communication = rec.communication;

  const zonesRec = asRecord(rec.zones);
  if (zonesRec) {
    const zones: Record<string, "priority" | "blocked"> = {};
    for (const [zoneId, mark] of Object.entries(zonesRec)) {
      if (mark === "priority" || mark === "blocked") zones[zoneId] = mark;
    }
    if (Object.keys(zones).length > 0) out.zones = zones;
  }
  return out;
}

function isExpired(seen: string | null): boolean {
  if (!seen) return false;
  const seenMs = Date.parse(seen);
  if (Number.isNaN(seenMs)) return false;
  return Date.now() - seenMs > EXPIRY_DAYS * 24 * 3600 * 1000;
}

async function deleteById(base: string, svc: Headers, id: string): Promise<void> {
  await fetch(`${base}/rest/v1/guest_profiles?id=eq.${id}`, {
    method: "DELETE",
    headers: { ...svc, Prefer: "return=minimal" },
  }).catch(() => {});
}

// Reads the `role` claim from a Supabase legacy key (a JWT). Returns null for
// non-JWT keys (the new sb_secret_… format), which pass.
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
