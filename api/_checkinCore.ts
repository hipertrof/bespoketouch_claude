// Shared logic for the QR self-check-in endpoint, used by both the Vercel
// serverless function (api/checkin.ts) and the dev Vite middleware
// (vite-plugins/checkin-proxy.ts).
//
// Dependency-free plain fetch against Supabase REST, mirroring _guestCore.ts /
// _intakeCore.ts (the SDK crashed the serverless function). Underscore-prefixed
// so Vercel bundles it without routing it.
//
// The feature: reception can hand a guest their OWN phone instead of asking
// them to say their number aloud. The kiosk mints a short-lived code (action
// "mint", device-token-authed — same trust as every other kiosk write); the
// guest scans a QR encoding that code and reaches this endpoint anonymously
// from their own browser (actions "lookup" / "save"). The code is the only
// thing standing between an anonymous phone and a spa's guest_profiles table,
// so it is treated as a bearer credential:
//   * 15-minute TTL, checked server-side (not just cosmetic on the QR screen);
//   * lookup is capped per code (MAX_LOOKUPS) — a guest fumbling their own
//     number is fine, a code turned into a phone-probing oracle is not;
//   * a successful save kills the code (used_at) — one guest, one check-in.
//
// "save" deliberately can only UPDATE (or, on base-consent withdrawal, DELETE)
// an existing profile — it never creates one. A guest with no saved profile
// gets a clean "not found" and does the normal kiosk flow instead.
//
// Since the 0024 consent split this path DOES capture consent, with the same
// two toggles as the kiosk: base consent (structured comfort prefs) and health
// consent (Art. 9 zone marks + free-text notes). The code+phone pair is
// accepted as sufficient to grant/withdraw consent for an EXISTING profile.
// save semantics mirror the kiosk's HandoffStep:
//   * consent !== true            → the profile row is DELETED (withdrawal);
//   * consent + healthConsent     → full save incl. zones/notes, both stamps;
//   * consent, no healthConsent   → zones/notes stripped + health stamps
//     nulled, so stored health data is erased.
// lookup likewise returns zones/notes ONLY when the row carries a standing
// health consent.
//
// The intake this creates is deliberately incomplete (no name, no therapist,
// no treatment) — reception fills those in from /queue. status:"incomplete"
// is a new value alongside "submitted"/"done"; the 0018 24h-sweep and its
// Article-9 scrub apply to it exactly like any other intake.

import { randomBytes, createHash } from "node:crypto";
import { checkDeviceConfig, resolveDevice, svcHeaders, type DeviceAuthEnv } from "./_deviceAuth.js";
import {
  BASE_CONSENT_VERSION,
  HEALTH_CONSENT_VERSION,
  normalizePhone,
  phoneHash,
  resolveAccount,
  sanitizePreferences,
} from "./_guestCore.js";
import type { StoredPreferencesV1 } from "./_guestCore.js";

export interface CheckinEnv extends DeviceAuthEnv {
  hashSecret: string;
}

export interface CheckinResult {
  status: number;
  json: unknown;
}

interface CheckinBody {
  action?: string;
  deviceToken?: string;
  code?: string;
  phone?: string;
  consent?: boolean;
  healthConsent?: boolean;
  preferences?: unknown;
}

type Headers = Record<string, string>;
type JsonRecord = Record<string, unknown>;

const CODE_TTL_MINUTES = 15;
const MAX_LOOKUPS = 10;
// Kiosk can only mint again this often — the endpoint is anonymous once the
// code exists, so unlimited minting would let a compromised/idle kiosk churn
// out an unbounded number of live codes.
const MINT_COOLDOWN_SECONDS = 10;
// Incomplete intakes get the same retention window as a normal intake (0018's
// scrub/auto-done boundary treats every status the same).
const INTAKE_RETENTION_HOURS = 48;

export async function handleCheckin(
  body: CheckinBody | undefined,
  env: CheckinEnv,
): Promise<CheckinResult> {
  const configError = checkConfig(env);
  if (configError) return configError;

  switch (body?.action) {
    case "mint":
      return mintCode(body, env);
    case "lookup":
      return lookupByCode(body, env);
    case "save":
      return saveByCode(body, env);
    default:
      return { status: 400, json: { error: "Unknown or missing action." } };
  }
}

// ---------------------------------------------------------------------------
// mint — device-token-authed (the paired kiosk itself).
// ---------------------------------------------------------------------------

async function mintCode(body: CheckinBody, env: CheckinEnv): Promise<CheckinResult> {
  const device = await resolveDevice(body.deviceToken, env);
  if (!device) return { status: 401, json: { error: "This device is not paired." } };

  const base = env.url.replace(/\/$/, "");
  const svc = svcHeaders(env);

  const locActive = await getJson(
    `${base}/rest/v1/locations?select=id&id=eq.${device.locationId}&active=is.true`,
    svc,
  );
  if (!asArray(locActive.body).length) {
    return { status: 403, json: { error: "This location is not active." } };
  }

  // Cooldown: reject if this kiosk minted a still-live code very recently.
  const recent = await getJson(
    `${base}/rest/v1/checkin_codes?select=created_at&created_by=eq.${device.tokenId}` +
      `&created_at=gte.${new Date(Date.now() - MINT_COOLDOWN_SECONDS * 1000).toISOString()}` +
      `&order=created_at.desc&limit=1`,
    svc,
  );
  if (asArray(recent.body).length > 0) {
    return { status: 429, json: { error: "Please wait a moment before showing a new code." } };
  }

  const code = randomBytes(16).toString("hex");
  const codeHash = sha256(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  const insert = await fetch(`${base}/rest/v1/checkin_codes`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      code_hash: codeHash,
      location_id: device.locationId,
      created_by: device.tokenId,
      expires_at: expiresAt,
    }),
  });
  if (!insert.ok) {
    return { status: 502, json: { error: `Could not create a check-in code (${insert.status}).` } };
  }

  return { status: 200, json: { code, expiresAt } };
}

// ---------------------------------------------------------------------------
// lookup — anonymous, code-authed.
// ---------------------------------------------------------------------------

async function lookupByCode(body: CheckinBody, env: CheckinEnv): Promise<CheckinResult> {
  const phone = normalizePhone(body.phone);
  if (!phone) return { status: 400, json: { error: "Invalid phone number." } };

  const base = env.url.replace(/\/$/, "");
  const svc = svcHeaders(env);

  const resolved = await resolveCode(body.code, base, svc, { bumpLookup: true });
  if (!resolved.ok) return resolved.result;
  const { locationId } = resolved;

  const accountId = await resolveAccount(base, svc, locationId);
  if (!accountId) return { status: 403, json: { error: "Unknown or inactive location." } };

  const hash = phoneHash(phone, accountId, env.hashSecret);
  const rows = asArray(
    (
      await getJson(
        `${base}/rest/v1/guest_profiles?select=preferences,health_consent_version&account_id=eq.${accountId}&phone_hash=eq.${hash}`,
        svc,
      )
    ).body,
  );
  const row = rows[0];
  if (!row) return { status: 200, json: { found: false } };

  // A saved profile IS standing base consent — that's what let the profile
  // exist to look up. Health consent is separate: the row's own stamp decides
  // whether Art. 9 health data (marked zones + free-text notes) is included at
  // all. Without it, strip all three defensively (they shouldn't be present).
  const healthConsent = typeof row.health_consent_version === "string";
  const prefs = asRecord(row.preferences);
  if (prefs && !healthConsent) {
    delete prefs.zones;
    delete prefs.zoneNotes;
    delete prefs.generalNote;
  }
  return { status: 200, json: { found: true, preferences: prefs ?? null, healthConsent } };
}

// ---------------------------------------------------------------------------
// save — anonymous, code-authed. Only ever UPDATEs (or, on base-consent
// withdrawal, DELETEs) an existing profile and creates the incomplete intake;
// never originates a new consented record.
// ---------------------------------------------------------------------------

async function saveByCode(body: CheckinBody, env: CheckinEnv): Promise<CheckinResult> {
  const phone = normalizePhone(body.phone);
  if (!phone) return { status: 400, json: { error: "Invalid phone number." } };

  const sanitized = sanitizePreferences(body.preferences);
  if (!sanitized) return { status: 400, json: { error: "Invalid preferences payload." } };

  // Same two-consent model as the kiosk (GuestContext's SET_GUEST_CONSENT):
  // health consent is nested under base and forced off without it.
  const consent = body.consent === true;
  const healthConsent = consent && body.healthConsent === true;

  // sanitizePreferences passes zones/zoneNotes/generalNote (GDPR Art. 9 health
  // data — a zone mark alone counts, even with no text) straight through
  // because it has no consent awareness of its own. Strip them here whenever
  // health consent isn't standing, so a phone can never store health data
  // without it.
  if (!healthConsent) {
    delete sanitized.zones;
    delete sanitized.zoneNotes;
    delete sanitized.generalNote;
  }
  const preferences = sanitized;

  const base = env.url.replace(/\/$/, "");
  const svc = svcHeaders(env);

  // bumpLookup: true — a "save" also reveals whether a phone matches a profile
  // (found vs. found:false), so it must count against the per-code lookup cap;
  // otherwise it is an uncapped phone-probing oracle that "lookup" is not.
  const resolved = await resolveCode(body.code, base, svc, { bumpLookup: true });
  if (!resolved.ok) return resolved.result;
  const { id: codeId, locationId } = resolved;

  const accountId = await resolveAccount(base, svc, locationId);
  if (!accountId) return { status: 403, json: { error: "Unknown or inactive location." } };

  const hash = phoneHash(phone, accountId, env.hashSecret);
  const existing = asArray(
    (
      await getJson(
        `${base}/rest/v1/guest_profiles?select=id&account_id=eq.${accountId}&phone_hash=eq.${hash}`,
        svc,
      )
    ).body,
  );
  if (!existing[0]) {
    // No profile to edit — save never creates one. The guest does the normal
    // kiosk flow instead.
    return { status: 200, json: { found: false } };
  }

  const now = new Date().toISOString();

  if (!consent) {
    // Base consent withdrawn: as effective as the grant (GDPR Art. 7(3)),
    // mirroring the kiosk's HandoffStep forget branch — erase the whole
    // profile rather than leaving a consent-less row behind. Today's visit
    // still gets checked in below, from the comfort fields alone (health data
    // was already stripped above since healthConsent can't stand without
    // base).
    const del = await fetch(
      `${base}/rest/v1/guest_profiles?account_id=eq.${accountId}&phone_hash=eq.${hash}`,
      { method: "DELETE", headers: { ...svc, Prefer: "return=minimal" } },
    );
    if (!del.ok) {
      return { status: 500, json: { error: `Could not delete preferences (${del.status}).` } };
    }
  } else {
    const patch = await fetch(
      `${base}/rest/v1/guest_profiles?account_id=eq.${accountId}&phone_hash=eq.${hash}`,
      {
        method: "PATCH",
        headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          preferences,
          consent_version: BASE_CONSENT_VERSION,
          consent_at: now,
          health_consent_version: healthConsent ? HEALTH_CONSENT_VERSION : null,
          health_consent_at: healthConsent ? now : null,
          last_seen_at: now,
        }),
      },
    );
    if (!patch.ok) {
      return { status: 500, json: { error: `Could not update preferences (${patch.status}).` } };
    }
  }

  // Single-use: atomically claim the code (set used_at only while it is still
  // null) BEFORE creating the intake. If a concurrent save/retry already claimed
  // it, PostgREST returns zero rows and we stop here — so a double-tap can never
  // create two intakes for one visit. This replaces the old fire-and-forget
  // "mark used" that reported ok:true even when the write silently failed.
  const claim = await fetch(
    `${base}/rest/v1/checkin_codes?id=eq.${codeId}&used_at=is.null`,
    {
      method: "PATCH",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ used_at: now }),
    },
  );
  if (!claim.ok) {
    return { status: 500, json: { error: `Could not complete the check-in (${claim.status}).` } };
  }
  if (asArray(await claim.json().catch(() => null)).length === 0) {
    return { status: 410, json: { error: "This code has already been used." } };
  }

  // Handoff carries exactly what was just written (or, on withdrawal, the
  // comfort-only submission) — never a raw unsanitized client payload.
  const intakeInsert = await fetch(`${base}/rest/v1/intakes`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      location_id: locationId,
      status: "incomplete",
      party_size: 1,
      guest_names: [""],
      treatment_selections: [{ treatmentId: null, minutes: null, nameI18n: null, price: null }],
      personalizations: [toPersonalizationState(preferences)],
      therapists: [null],
      expires_at: new Date(Date.now() + INTAKE_RETENTION_HOURS * 3600 * 1000).toISOString(),
    }),
  });
  if (!intakeInsert.ok) {
    return { status: 502, json: { error: `Could not create the check-in (${intakeInsert.status}).` } };
  }

  return { status: 200, json: { ok: true } };
}

// Maps the CRM's StoredPreferences shape onto an intake's PersonalizationState
// element (src/types.ts). bodyGender has no CRM equivalent — default "female"
// like a fresh kiosk guest; reception corrects it when completing the intake
// if needed, same as any other field on an incomplete row.
function toPersonalizationState(prefs: StoredPreferencesV1): JsonRecord {
  return {
    bodyGender: "female",
    zones: prefs.zones ?? {},
    zoneNotes: prefs.zoneNotes ?? {},
    generalNote: prefs.generalNote ?? "",
    preferences: {
      pressure: prefs.pressure ?? "Średni",
      oilId: prefs.oilId ?? "",
      tableWarming: prefs.tableWarming ?? false,
      headrestPillow: prefs.headrestPillow ?? "Standardowa",
      music: prefs.music ?? "nature",
      communication: prefs.communication ?? "silent",
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function checkConfig(env: CheckinEnv): CheckinResult | null {
  const deviceError = checkDeviceConfig(env);
  if (deviceError) return deviceError;
  if (!env.hashSecret) {
    return { status: 500, json: { error: "Server not configured: GUEST_HASH_SECRET is missing." } };
  }
  return null;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

type ResolvedCode =
  | { ok: true; id: string; locationId: string }
  | { ok: false; result: CheckinResult };

// Validates a code (unexpired, unused), optionally bumping+enforcing the
// lookup cap. Every action funnels through here so "what makes a code valid"
// has one definition, mirroring _deviceAuth.ts's resolveDevice.
async function resolveCode(
  rawCode: unknown,
  base: string,
  svc: Headers,
  opts: { bumpLookup: boolean },
): Promise<ResolvedCode> {
  if (typeof rawCode !== "string" || !/^[0-9a-f]{32}$/i.test(rawCode)) {
    return { ok: false, result: { status: 400, json: { error: "Invalid or missing code." } } };
  }
  const hash = sha256(rawCode);
  const rows = asArray(
    (
      await getJson(
        `${base}/rest/v1/checkin_codes?select=id,location_id,expires_at,used_at,lookup_count&code_hash=eq.${hash}`,
        svc,
      )
    ).body,
  );
  const row = rows[0];
  if (!row) return { ok: false, result: { status: 404, json: { error: "This code is invalid." } } };
  if (row.used_at) {
    return { ok: false, result: { status: 410, json: { error: "This code has already been used." } } };
  }
  if (typeof row.expires_at !== "string" || Date.parse(row.expires_at) < Date.now()) {
    return { ok: false, result: { status: 410, json: { error: "This code has expired." } } };
  }
  const lookupCount = typeof row.lookup_count === "number" ? row.lookup_count : 0;
  if (opts.bumpLookup) {
    if (lookupCount >= MAX_LOOKUPS) {
      return { ok: false, result: { status: 429, json: { error: "Too many attempts with this code." } } };
    }
    await fetch(`${base}/rest/v1/checkin_codes?id=eq.${String(row.id)}`, {
      method: "PATCH",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ lookup_count: lookupCount + 1 }),
    }).catch(() => {});
  }
  return { ok: true, id: String(row.id), locationId: String(row.location_id) };
}

function asArray(v: unknown): JsonRecord[] {
  return Array.isArray(v) ? (v as JsonRecord[]) : [];
}

function asRecord(v: unknown): JsonRecord | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : null;
}

async function getJson(url: string, headers: Headers): Promise<{ ok: boolean; status: number; body: unknown }> {
  const r = await fetch(url, { headers });
  const body = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body };
}
