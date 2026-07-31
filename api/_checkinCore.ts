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
  MARKETING_CONSENT_VERSION,
  nameKey,
  normalizePhone,
  phoneHash,
  resolveAccount,
  sanitizeContact,
  sanitizeDisplayName,
  sanitizePreferences,
} from "./_guestCore.js";
import type { StoredPreferencesV1 } from "./_guestCore.js";
import {
  FULL_SCOPE,
  clearSuppression,
  recordErasure,
  suppressContact,
  type ErasureScope,
} from "./_erasureLog.js";

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
  marketingConsent?: boolean;
  name?: unknown;
  email?: unknown;
  birthday?: unknown;
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
        `${base}/rest/v1/guest_profiles?select=preferences,health_consent_version,marketing_consent_version,display_name&account_id=eq.${accountId}&phone_hash=eq.${hash}`,
        svc,
      )
    ).body,
  );
  // Since 0032 a number can legitimately carry several profiles. Unlike the
  // kiosk lookup this one CANNOT offer a chooser: the caller is an anonymous
  // phone, and listing the candidates would tell whoever typed the number which
  // guests are registered under it. Taking rows[0] is worse still — it would
  // hand a stranger's preferences, health data included, to whoever guessed the
  // number. So an ambiguous number counts as no match, and the guest is sent to
  // the front desk, the one place a person can actually be identified.
  if (rows.length > 1) return { status: 200, json: { found: false, ambiguous: true } };
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
  // Same exposure rule as the kiosk lookup: the name is base-tier since v4 so
  // it always comes back, the marketing flag comes back, and the contact
  // e-mail/phone/birthday never do — those stay manager-only via /api/crm.
  const marketingConsent = typeof row.marketing_consent_version === "string";
  const name = typeof row.display_name === "string" ? row.display_name : null;
  // The phone renders the same comfort menu as the kiosk, so it needs the
  // location's config (0027). Raw jsonb — src/lib/comfort.ts normalizes it, and
  // `{}` means the built-in menu.
  const comfort = await fetchComfortConfig(base, svc, locationId);
  const pressureLevels = await fetchOfferedPressureLevels(base, svc, locationId);
  return {
    status: 200,
    json: {
      found: true,
      preferences: prefs ?? null,
      healthConsent,
      marketingConsent,
      name,
      comfort,
      pressureLevels,
    },
  };
}

// Pressure is restricted per SERVICE (services.pressure_levels, 0023), but this
// page has no treatment — reception picks it later when completing the
// incomplete intake. So the phone offers the UNION across the location's active
// services: a level no service offers can't be honoured whatever the guest is
// eventually booked for, while a level some service offers might be. Returns
// null (= all four, the column's own "no restriction" value) as soon as any
// active service is unrestricted, and also when the location has no services
// yet — the same permissive default the kiosk falls back to.
// Exported for api/_previsitCore.ts, which faces the same problem: a pre-visit
// link is minted before the guest picks anything, so it too can only offer the
// union across the location.
export async function fetchOfferedPressureLevels(
  base: string,
  svc: Record<string, string>,
  locationId: string,
): Promise<string[] | null> {
  const rows = asArray(
    (
      await getJson(
        `${base}/rest/v1/services?select=pressure_levels&location_id=eq.${locationId}&active=is.true`,
        svc,
      )
    ).body,
  );
  if (rows.length === 0) return null;
  const union = new Set<string>();
  for (const row of rows) {
    if (!Array.isArray(row.pressure_levels)) return null;
    for (const level of row.pressure_levels) {
      if (typeof level === "string") union.add(level);
    }
  }
  return union.size > 0 ? [...union] : null;
}

// location_settings.comfort for a location, or {} when unset/unreadable — the
// same "no config = built-in menu" default the client normalizer applies.
export async function fetchComfortConfig(
  base: string,
  svc: Record<string, string>,
  locationId: string,
): Promise<JsonRecord> {
  const rows = asArray(
    (
      await getJson(
        `${base}/rest/v1/location_settings?select=comfort&location_id=eq.${locationId}`,
        svc,
      )
    ).body,
  );
  const comfort = asRecord(rows[0]?.comfort);
  return comfort ?? {};
}

// Which comfort fields the location actually offers, plus the Polish label for
// each id-valued one. Mirrors stripDisabled()/comfortLabelsFor() in
// src/lib/comfort.ts — kept dependency-free here rather than shared, like every
// other duplication between api/ and src/.
export function comfortGate(comfort: JsonRecord): {
  offers: (key: "oil" | "music" | "pillow" | "tableWarming" | "communication") => boolean;
  labelOf: (key: "oil" | "music" | "pillow", id: string | undefined) => string | undefined;
} {
  const section = (key: string): JsonRecord | null => asRecord(comfort[key]);
  const offers = (key: "oil" | "music" | "pillow" | "tableWarming" | "communication") => {
    const enabled = section(key)?.enabled;
    // Absent section = the built-in default, which offers everything.
    return typeof enabled === "boolean" ? enabled : true;
  };
  const labelOf = (key: "oil" | "music" | "pillow", id: string | undefined) => {
    if (!id) return undefined;
    const options = asArray(section(key)?.options);
    const match = options.find((o) => asRecord(o)?.id === id);
    const names = asRecord(asRecord(match)?.name_i18n);
    const pl = names?.pl;
    return typeof pl === "string" && pl ? pl : undefined;
  };
  return { offers, labelOf };
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

  // Per-location comfort options (0027). sanitizePreferences is structural
  // only, so a phone could post a field this location switched off — drop it
  // here, the same way stripDisabled does on the kiosk, so neither the stored
  // profile nor the intake carries a setting the spa can't honour.
  const gate = comfortGate(await fetchComfortConfig(base, svc, locationId));
  if (!gate.offers("oil")) delete preferences.oilId;
  if (!gate.offers("music")) delete preferences.music;
  if (!gate.offers("pillow")) delete preferences.headrestPillow;
  if (!gate.offers("tableWarming")) delete preferences.tableWarming;
  if (!gate.offers("communication")) delete preferences.communication;

  const hash = phoneHash(phone, accountId, env.hashSecret);
  // The consent stamps come back alongside the id so a tier being switched off
  // below can be recognised as the withdrawal it is (see _erasureLog.ts) —
  // widening this read rather than adding a second query.
  // Narrowed by name since 0032, where (phone, name) identifies a profile.
  // Matching on the phone alone would let whoever holds a check-in code
  // overwrite the profile of anyone else registered under that number — the
  // exact takeover 0032 exists to stop. The match is strict: no "there is only
  // one row on this number, so it must be them" fallback, because that is
  // precisely the guess that loses someone's record. An unmatched name means
  // there is nothing here to edit, and the guest goes through reception.
  const nameForKey = sanitizeDisplayName(body.name);
  const key = nameKey(nameForKey);
  const existing = asArray(
    (
      await getJson(
        `${base}/rest/v1/guest_profiles?select=id,health_consent_version,marketing_consent_version` +
          `&account_id=eq.${accountId}&phone_hash=eq.${hash}&name_key=eq.${encodeURIComponent(key)}`,
        svc,
      )
    ).body,
  );
  if (!existing[0]) {
    // No profile to edit — save never creates one. The guest does the normal
    // kiosk flow instead.
    return { status: 200, json: { found: false } };
  }
  // Every write below targets this one row by id. The old
  // `account_id=eq.X&phone_hash=eq.Y` filters would now touch every profile on
  // the number — and on the withdrawal branch that means deleting strangers'
  // records alongside the guest's own.
  const profileId = String(existing[0].id);

  const now = new Date().toISOString();
  const hadHealth = typeof existing[0]?.health_consent_version === "string";
  const hadMarketing = typeof existing[0]?.marketing_consent_version === "string";
  const verification = "Guest's own phone, authenticated by the one-time check-in code from the kiosk QR";

  if (!consent) {
    // Base consent withdrawn: as effective as the grant (GDPR Art. 7(3)),
    // mirroring the kiosk's HandoffStep forget branch — erase the whole
    // profile rather than leaving a consent-less row behind. Today's visit
    // still gets checked in below, from the comfort fields alone (health data
    // was already stripped above since healthConsent can't stand without
    // base).
    const del = await fetch(
      `${base}/rest/v1/guest_profiles?id=eq.${profileId}&account_id=eq.${accountId}`,
      { method: "DELETE", headers: { ...svc, Prefer: "return=minimal" } },
    );
    if (!del.ok) {
      return { status: 500, json: { error: `Could not delete preferences (${del.status}).` } };
    }
    await recordErasure(base, svc, {
      accountId,
      subjectRef: hash,
      channel: "checkin",
      identityVerification: verification,
      scope: FULL_SCOPE,
      executedBySystem: "checkin-code",
    });
    await suppressContact(base, svc, accountId, hash, "erasure");
  } else {
    // Same split as _guestCore.saveGuest: the name rides on base consent (so
    // it survives a marketing withdrawal), the contact columns ride on the
    // marketing tier and are nulled without it. The phone always sends the
    // name field, so blanking it here is a deliberate edit, not an omission.
    const displayName = nameForKey;
    const contact = body.marketingConsent === true ? sanitizeContact(body) : null;
    const patch = await fetch(
      `${base}/rest/v1/guest_profiles?id=eq.${profileId}&account_id=eq.${accountId}`,
      {
        method: "PATCH",
        headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          preferences,
          consent_version: BASE_CONSENT_VERSION,
          consent_at: now,
          health_consent_version: healthConsent ? HEALTH_CONSENT_VERSION : null,
          health_consent_at: healthConsent ? now : null,
          display_name: displayName,
          contact_phone: contact ? phone : null,
          contact_email: contact?.email ?? null,
          birthday: contact?.birthday ?? null,
          marketing_consent_version: contact ? MARKETING_CONSENT_VERSION : null,
          marketing_consent_at: contact ? now : null,
          last_seen_at: now,
        }),
      },
    );
    if (!patch.ok) {
      return { status: 500, json: { error: `Could not update preferences (${patch.status}).` } };
    }

    // Same ON -> OFF rule as the kiosk save: only a tier that was standing and
    // is now gone erased anything.
    const scope: ErasureScope[] = [];
    if (hadHealth && !healthConsent) scope.push("health");
    if (hadMarketing && !contact) scope.push("marketing", "contact");
    if (scope.length > 0) {
      await recordErasure(base, svc, {
        accountId,
        subjectRef: hash,
        channel: "checkin",
        identityVerification: verification,
        scope,
        outcome: "partial",
        executedBySystem: "checkin-code",
      });
    }
    if (hadMarketing && !contact) {
      await suppressContact(base, svc, accountId, hash, "marketing_withdrawal");
    } else if (contact) {
      // A fresh opt-in on the guest's own phone supersedes an earlier objection.
      await clearSuppression(base, svc, accountId, hash);
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
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      location_id: locationId,
      status: "incomplete",
      party_size: 1,
      guest_names: [""],
      treatment_selections: [{ treatmentId: null, minutes: null, nameI18n: null, price: null }],
      personalizations: [toPersonalizationState(preferences, gate)],
      therapists: [null],
      expires_at: new Date(Date.now() + INTAKE_RETENTION_HOURS * 3600 * 1000).toISOString(),
    }),
  });
  if (!intakeInsert.ok) {
    return { status: 502, json: { error: `Could not create the check-in (${intakeInsert.status}).` } };
  }

  // Durable visit history (0025). Only when the profile still exists (consent
  // kept — a withdrawal just deleted it, and its history cascaded away).
  // Detail-less at this point (no treatment/therapist yet — reception fills
  // the intake in later); best-effort, never fails the check-in.
  if (consent && existing[0]?.id) {
    const intakeRows = asArray(await intakeInsert.json().catch(() => null));
    const intakeId = typeof intakeRows[0]?.id === "string" ? intakeRows[0].id : null;
    const locRows = asArray(
      (await getJson(`${base}/rest/v1/locations?select=name&id=eq.${locationId}`, svc)).body,
    );
    await fetch(`${base}/rest/v1/guest_visits`, {
      method: "POST",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        account_id: accountId,
        location_id: locationId,
        location_name: typeof locRows[0]?.name === "string" ? locRows[0].name : "",
        guest_id: String(existing[0].id),
        intake_id: intakeId,
      }),
    }).catch(() => {});
  }

  return { status: 200, json: { ok: true } };
}

// Maps the CRM's StoredPreferences shape onto an intake's PersonalizationState
// element (src/types.ts). bodyGender carries over from the stored profile when
// the guest set it on a previous visit, falling back to "female" like a fresh
// kiosk guest; reception corrects it when completing the intake if needed, same
// as any other field on an incomplete row.
export function toPersonalizationState(
  prefs: StoredPreferencesV1,
  gate: ReturnType<typeof comfortGate>,
): JsonRecord {
  // Absent = the location doesn't offer it (already gated above), so the field
  // is omitted rather than defaulted — /queue then prints no row for it.
  const preferences: JsonRecord = { pressure: prefs.pressure ?? "Średni" };
  if (prefs.oilId !== undefined) preferences.oilId = prefs.oilId;
  if (prefs.tableWarming !== undefined) preferences.tableWarming = prefs.tableWarming;
  if (prefs.headrestPillow !== undefined) preferences.headrestPillow = prefs.headrestPillow;
  if (prefs.music !== undefined) preferences.music = prefs.music;
  if (prefs.communication !== undefined) preferences.communication = prefs.communication;

  // Polish label snapshot for the id-valued fields, same as the kiosk writes at
  // handoff, so /queue still reads correctly after the option list is edited.
  const comfortLabels: JsonRecord = {};
  const oil = gate.labelOf("oil", prefs.oilId);
  const music = gate.labelOf("music", prefs.music);
  const pillow = gate.labelOf("pillow", prefs.headrestPillow);
  if (oil) comfortLabels.oil = oil;
  if (music) comfortLabels.music = music;
  if (pillow) comfortLabels.pillow = pillow;

  return {
    bodyGender: prefs.bodyGender ?? "female",
    zones: prefs.zones ?? {},
    zoneNotes: prefs.zoneNotes ?? {},
    generalNote: prefs.generalNote ?? "",
    preferences,
    comfortLabels,
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

export function sha256(input: string): string {
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
