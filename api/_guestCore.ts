// Shared logic for the opt-in guest CRM endpoint, used by both the Vercel
// serverless function (api/guest.ts) and the dev Vite middleware
// (vite-plugins/guest-proxy.ts).
//
// Deliberately dependency-free — plain fetch against Supabase's REST API,
// mirroring api/_membersCore.ts. (The Supabase SDK crashed the serverless
// function with FUNCTION_INVOCATION_FAILED.) Lives in /api as an underscore-
// prefixed file so Vercel bundles it WITHOUT turning it into its own route.
//
// Runs with the SERVICE ROLE key. The kiosk has no login/JWT, but PHASE 2
// HARDENING made it authenticated all the same: the tablet presents its paired
// device token and the server derives the location — and from it the account —
// server-side. The client no longer names the location it wants to act on.
//
// That closes the Phase-3 anon-bridge gap this endpoint shipped with, where
// anyone holding a location UUID could probe a phone number to read, overwrite,
// or erase that guest's stored preferences. Reaching a guest profile now
// requires a live token on an active slot, so the blast radius of a guessed
// phone is limited to spas the caller has a paired kiosk in — and revoking the
// slot cuts it off.
//
// Two guarantees kept from v1: `save` requires consent === true and stamps
// consent_version/consent_at SERVER-side (the client can't forge them), and the
// raw phone exists only in the request body (HTTPS) and is hashed immediately —
// never persisted, never logged.

import { createHmac } from "node:crypto";
import { checkDeviceConfig, resolveDevice, type DeviceAuthEnv } from "./_deviceAuth.js";

// Bump when the consent wording (consentSaveBody in i18n) materially changes.
// v2: the copy now explicitly discloses that marked body areas AND the notes
// written about them are stored as health information (GDPR Art. 9) — the
// wording change that unlocked storing zoneNotes/generalNote below.
export const CONSENT_VERSION = "2026-07-v2";

// ~18 months. A lookup that finds a row older than this deletes it and reports
// a miss (lazy GDPR storage-limitation; a sweep job comes later).
const EXPIRY_DAYS = 540;

// Free-text notes are capped rather than unbounded — same spirit as the
// intake's MAX_BODY_BYTES and the survey's MAX_NOTE_CHARS.
const MAX_ZONE_NOTE_CHARS = 500;
const MAX_GENERAL_NOTE_CHARS = 1000;

export interface GuestEnv extends DeviceAuthEnv {
  hashSecret: string;
}

export interface GuestResult {
  status: number;
  json: unknown;
}

// The versioned shape stored in guest_profiles.preferences. Kept in sync with
// the client's StoredPreferences (src/lib/guestProfile.ts); the server
// re-validates it structurally on save so a buggy/hostile client can't
// smuggle extra keys in.
//
// v1 = structured comfort settings + zone marks only.
// v2 = ALSO zoneNotes/generalNote — free-text health information (GDPR
// Art. 9). Storable only because `save` requires consent===true and the
// kiosk's v2 consent copy explicitly names this as health data before the
// guest can opt in (see CONSENT_VERSION above). Every save from here on
// writes v2; v1 rows already in the table simply lack these two keys.
export interface StoredPreferencesV1 {
  v: 1 | 2;
  pressure?: string;
  oilId?: string;
  tableWarming?: boolean;
  headrestPillow?: string;
  music?: string;
  communication?: string;
  // Body-zone marks, "priority" | "blocked" only ("standard" is the default and
  // is never stored).
  zones?: Record<string, "priority" | "blocked">;
  // v2 only. Per-zone free text and the overall note, guest-authored.
  zoneNotes?: Record<string, string>;
  generalNote?: string;
}

interface GuestBody {
  action?: string;
  deviceToken?: string;
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
  const auth = await authorizeKiosk(body, env, base, svc);
  if (!auth.ok) return auth.result;
  const accountId = auth.accountId;

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

  // Touch last_seen_at so an active guest's row keeps living. AWAITED, not
  // fire-and-forget: this timestamp is the only thing holding the row inside the
  // 540-day retention window, and on a serverless host an unawaited PATCH can be
  // dropped when the instance suspends after responding — which would quietly age
  // out and delete a still-active consented profile. A failed touch is non-fatal.
  await fetch(`${base}/rest/v1/guest_profiles?id=eq.${String(row.id)}`, {
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
  const auth = await authorizeKiosk(body, env, base, svc);
  if (!auth.ok) return auth.result;
  const accountId = auth.accountId;

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
  const auth = await authorizeKiosk(body, env, base, svc);
  if (!auth.ok) return auth.result;
  const accountId = auth.accountId;

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
  const deviceError = checkDeviceConfig(env);
  if (deviceError) return deviceError;
  if (!env.hashSecret) {
    return { status: 500, json: { error: "Server not configured: GUEST_HASH_SECRET is missing." } };
  }
  return null;
}

function svcHeaders(env: GuestEnv): Headers {
  return { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` };
}

type KioskAuth =
  | { ok: true; accountId: string }
  | { ok: false; result: GuestResult };

// The authorization every action shares: prove the caller is a paired kiosk,
// then derive the account whose guest profiles it may touch. The token is the
// ONLY source of location — a body-supplied location is never consulted, which
// is what stops one spa's kiosk (or a bare script) from reaching another's
// guests.
async function authorizeKiosk(
  body: GuestBody,
  env: GuestEnv,
  base: string,
  svc: Headers,
): Promise<KioskAuth> {
  const device = await resolveDevice(body.deviceToken, env);
  if (!device) {
    return { ok: false, result: { status: 401, json: { error: "This device is not paired." } } };
  }
  const accountId = await resolveAccount(base, svc, device.locationId);
  if (!accountId) {
    return { ok: false, result: { status: 403, json: { error: "Unknown or inactive location." } } };
  }
  return { ok: true, accountId };
}

// Resolves a location id to its account, but ONLY for an active location, so a
// kiosk paired to a deactivated location stops resolving. Returns null for
// unknown / inactive / missing input.
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
  let digits = trimmed.replace(/\D/g, "");
  // "00" is the international access code — the same number a guest might also
  // write with a leading "+". Fold them together so the same real number hashes
  // to one value; otherwise a save and a later lookup/forget can miss each other
  // and a GDPR erasure silently deletes nothing.
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 8) return null;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 9) return `+48${digits}`; // bare Polish mobile/landline
  return `+${digits}`;
}

export function phoneHash(phone: string, accountId: string, secret: string): string {
  return createHmac("sha256", secret + accountId).update(phone).digest("hex");
}

// Server-side whitelist. Drops any key not in the known set and any zone value
// other than priority/blocked — structural defense so nothing beyond the
// agreed v2 shape can reach the table even if a client sends it. zoneNotes/
// generalNote are accepted here ONLY because the caller (saveGuest) already
// rejected the request if consent !== true — this function has no consent
// awareness of its own, so never call it from a path that skips that check.
// Returns null only if the payload isn't an object at all.
function sanitizePreferences(input: unknown): StoredPreferencesV1 | null {
  const rec = asRecord(input);
  if (!rec) return null;

  const out: StoredPreferencesV1 = { v: 2 };
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

  const zoneNotesRec = asRecord(rec.zoneNotes);
  if (zoneNotesRec) {
    const zoneNotes: Record<string, string> = {};
    for (const [zoneId, note] of Object.entries(zoneNotesRec)) {
      if (typeof note === "string" && note.trim().length > 0) {
        zoneNotes[zoneId] = note.trim().slice(0, MAX_ZONE_NOTE_CHARS);
      }
    }
    if (Object.keys(zoneNotes).length > 0) out.zoneNotes = zoneNotes;
  }
  if (typeof rec.generalNote === "string" && rec.generalNote.trim().length > 0) {
    out.generalNote = rec.generalNote.trim().slice(0, MAX_GENERAL_NOTE_CHARS);
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
