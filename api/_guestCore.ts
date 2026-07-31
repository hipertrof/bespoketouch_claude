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
// Guarantees: `save` requires base consent === true, stores the Art. 9 zone
// marks and notes only under a second explicit healthConsent === true, and
// stamps all consent versions/timestamps SERVER-side (the client can't forge
// them). The raw phone exists only in the request body (HTTPS) and is hashed
// immediately — never persisted, never logged.

import { createHmac } from "node:crypto";
import { checkDeviceConfig, resolveDevice, type DeviceAuthEnv } from "./_deviceAuth.js";
import {
  FULL_SCOPE,
  clearSuppression,
  recordErasure,
  suppressContact,
  type ErasureScope,
} from "./_erasureLog.js";

// Two consents since v3 (migration 0024). Base consent gates the profile
// existing at all; health consent additionally gates the body-zone marks AND
// the free-text zoneNotes/generalNote (GDPR Art. 9 — a marked zone reveals
// health-relevant info even with no text attached — consentHealthBody). Bump
// the matching constant whenever its disclosure copy materially changes. Rows
// saved under the single "2026-07-v2" consent (whose copy already named the
// marked areas and notes as health data) were backfilled with
// health_consent_version = consent_version in 0024.
//
// v4 widens BASE to cover the guest's display name alongside the structured
// comfort prefs (consentSaveBody names it). Recognising a returning guest is
// part of remembering them, not a marketing act — and the previous split had
// a real cost: a profile with no name is one the spa cannot search, cannot
// verify, and therefore cannot honour an Art. 15/17 request against, which
// made the guest's own rights HARDER to exercise, not easier. Opting out is
// still a clean binary: base off deletes the row entirely.
//
// No backfill: the v3 base copy did not mention the name, so pre-v4 rows
// genuinely did not consent to it under this tier — and they have no name
// stored anyway (it was nulled), so there is nothing to legitimise after the
// fact. Legacy rows that DO carry a name got it under the marketing copy
// below, which covered storing it, so they stay lawful as they are. Nameless
// rows heal on the guest's next visit, and the 540-day expiry ages out the
// rest.
export const BASE_CONSENT_VERSION = "2026-07-v4-base";
export const HEALTH_CONSENT_VERSION = "2026-07-v3-health";

// A third tier since migration 0025, collapsed to one (from two) in 0026, and
// narrowed in v6 (see BASE above). It now covers only what its name says: the
// raw contact phone/e-mail, optional birthday, and permission to CONTACT the
// guest with them. The display name moved down to base. 0026's finding still
// holds — "we remember your name but may not contact you" is not a state
// guests care to distinguish — but the fix was to merge the name DOWN into
// base rather than up into marketing, which is what v6 does. Do not re-add a
// separate identity tier. Sending itself isn't built yet. Stamped
// server-side; a save with marketingConsent !== true nulls every contact +
// marketing column (withdrawal-erases, same guarantee as the health tier) —
// it just no longer takes the guest's name with it.
export const MARKETING_CONSENT_VERSION = "2026-07-v6-marketing";

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
// v1 = structured comfort settings only.
// v2 = ALSO zones/zoneNotes/generalNote — the marked body areas and any
// free-text about them, all GDPR Art. 9 health information (a mark alone,
// with no text, still discloses a health-relevant area). Since the 0024
// consent split these three keys are present ONLY when the row carries
// health_consent_version (a separate explicit opt-in); a save without health
// consent writes a v2 blob with all three absent.
export interface StoredPreferencesV1 {
  v: 1 | 2;
  // Which silhouette the body map draws. Base tier, NOT health data — it is
  // never stripped alongside zones/zoneNotes/generalNote below.
  bodyGender?: "male" | "female";
  pressure?: string;
  oilId?: string;
  tableWarming?: boolean;
  headrestPillow?: string;
  music?: string;
  communication?: string;
  // Body-zone marks, "priority" | "blocked" only ("standard" is the default and
  // is never stored). Health data (see health_consent_version) since 0024,
  // even though it carries no free text.
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
  healthConsent?: boolean;
  marketingConsent?: boolean;
  name?: unknown;
  email?: unknown;
  birthday?: unknown;
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
        `${base}/rest/v1/guest_profiles?select=id,preferences,health_consent_version,marketing_consent_version,display_name,last_seen_at,updated_at` +
          `&account_id=eq.${accountId}&phone_hash=eq.${hash}`,
        svc,
      )
    ).body,
  );
  // Since 0032 a number can legitimately carry several profiles, so this
  // returns EVERY match and lets the front desk pick. It must not choose for
  // them: these preferences include the zones a guest wants avoided, so
  // silently loading the wrong person's could put a therapist to work on an
  // injured area. `rows[0]` was safe only while the phone was the whole key.
  const live: Record<string, unknown>[] = [];
  for (const row of rows) {
    // Lazy expiry: a stale profile is deleted and left out of the matches.
    const seen = row.last_seen_at ?? row.updated_at;
    if (isExpired(typeof seen === "string" ? seen : null)) {
      await deleteById(base, svc, String(row.id));
      // An erasure the spa never asked for still has to be demonstrable — this
      // is the storage-limitation promise being kept, and it is exactly the kind
      // of deletion a guest later asks about ("why is my profile gone?").
      // No suppression entry: the guest never objected, the clock simply ran out.
      await recordErasure(base, svc, {
        accountId,
        subjectRef: hash,
        channel: "retention",
        identityVerification: "n/a — automatic, no request received",
        scope: FULL_SCOPE,
        executedBySystem: `retention-${EXPIRY_DAYS}d`,
      });
      continue;
    }
    live.push(row);
  }
  if (live.length === 0) return { status: 200, json: { found: false, matches: [] } };

  // Touch last_seen_at so an active guest's row keeps living. AWAITED, not
  // fire-and-forget: this timestamp is the only thing holding the row inside the
  // 540-day retention window, and on a serverless host an unawaited PATCH can be
  // dropped when the instance suspends after responding — which would quietly age
  // out and delete a still-active consented profile. A failed touch is non-fatal.
  //
  // Only when the number resolves to ONE person. With several, we don't yet
  // know which of them is standing at the desk, and touching all of them would
  // renew the retention clock of someone who never came in — the storage
  // limitation the expiry above exists to honour. Whoever is picked gets their
  // row touched by the save that follows.
  if (live.length === 1) {
    await fetch(`${base}/rest/v1/guest_profiles?id=eq.${String(live[0].id)}`, {
      method: "PATCH",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
    }).catch(() => {});
  }

  const matches = live.map((row) => {
    // Defense in depth: without health consent the zones/notes must not exist in
    // the blob at all (save strips them), but strip again on the way out so a
    // row that somehow carries them without the stamp can't leak them.
    const healthConsent = typeof row.health_consent_version === "string";
    let preferences = row.preferences ?? null;
    if (!healthConsent && preferences && typeof preferences === "object") {
      const { zones: _z, zoneNotes: _zn, generalNote: _gn, ...rest } = preferences as Record<string, unknown>;
      preferences = rest;
    }
    // The name is base-tier since v4, so it comes back whenever the row does —
    // the kiosk needs it to greet a returning guest and to prefill the consent
    // card. Contact data (e-mail/phone/birthday) is still manager-only: it never
    // leaves /api/crm, so the kiosk gets the marketing flag but not its payload.
    const marketingConsent = typeof row.marketing_consent_version === "string";
    const name = typeof row.display_name === "string" ? row.display_name : null;
    // Dates the picker labels each candidate with ("last visit 12 Jul"), so the
    // receptionist has something besides the name to tell two guests apart.
    const lastSeen = typeof row.last_seen_at === "string" ? row.last_seen_at : null;
    // Still no identifier: the client picks a match and sends its NAME back,
    // and (phone, name) is the key the save lands on. Nothing here needs a row
    // id, so none leaves the server.
    return { preferences, healthConsent, marketingConsent, name, lastSeen };
  });

  return { status: 200, json: { found: true, matches } };
}

async function saveGuest(body: GuestBody, env: GuestEnv): Promise<GuestResult> {
  // Consent is mandatory and cannot be inferred — an explicit opt-in.
  if (body.consent !== true) {
    return { status: 400, json: { error: "Consent is required to save preferences." } };
  }
  const phone = normalizePhone(body.phone);
  if (!phone) return { status: 400, json: { error: "Invalid phone number." } };
  // Refuse to key a profile on an obvious placeholder. The client blocks these
  // at the field so a guest sees it immediately; this is the backstop, and the
  // distinct code lets the kiosk say why rather than showing a generic failure.
  if (isImplausiblePhone(phone)) {
    return {
      status: 400,
      json: { error: "That phone number looks invalid.", code: "implausible_phone" },
    };
  }

  const preferences = sanitizePreferences(body.preferences);
  if (!preferences) return { status: 400, json: { error: "Invalid preferences payload." } };

  // Health consent is a second, separate opt-in gating the Art. 9 health data:
  // the marked body zones AND any free-text about them. Without it, all three
  // are stripped from the payload — and because the upsert replaces the whole
  // preferences column and nulls the health stamps, a save with health consent
  // withdrawn also erases previously stored zones/notes.
  const healthConsent = body.healthConsent === true;
  if (!healthConsent) {
    delete preferences.zones;
    delete preferences.zoneNotes;
    delete preferences.generalNote;
  }

  const base = env.url.replace(/\/$/, "");
  const svc = svcHeaders(env);
  const auth = await authorizeKiosk(body, env, base, svc);
  if (!auth.ok) return auth.result;
  const accountId = auth.accountId;

  // Base tier (v4): the display name is stored whenever the profile is, so a
  // returning guest can be greeted and — the part that actually matters — so
  // the spa can find the row when that guest exercises Art. 15/17. Null only
  // when no name was captured at all.
  const displayName = sanitizeDisplayName(body.name);

  // Marketing is the third opt-in (requires base, checked above) and now
  // covers only outreach: the raw contact phone/e-mail, optional birthday,
  // and permission to use them. Without it every contact + marketing column
  // is nulled in the upsert, so withdrawal still erases — it just no longer
  // takes the guest's name with it. contact_phone is the already-normalized
  // phone, stored RAW under this tier; phone_hash stays the only lookup key.
  const contact = body.marketingConsent === true ? sanitizeContact(body) : null;

  const hash = phoneHash(phone, accountId, env.hashSecret);

  // Read the existing stamps before overwriting them. The upsert below is a
  // whole-row merge, so a save with a tier switched off silently ERASES that
  // tier's data — which is a withdrawal, and the most common one in daily use
  // (the guest un-ticks a box at handoff). Without this read the write cannot
  // tell a brand-new guest from someone withdrawing, and the erasure would go
  // unrecorded. One extra request on the kiosk save path, deliberately paid.
  // Since 0032 the identity is (account, phone, name), so this must read the
  // row belonging to THIS person — not merely the first row on the number.
  // Derived from `displayName`, the post-sanitize value that actually gets
  // stored, because the 0032 trigger computes name_key from the stored column.
  const key = nameKey(displayName);
  const priorRows = asArray(
    (
      await getJson(
        `${base}/rest/v1/guest_profiles?select=health_consent_version,marketing_consent_version` +
          `&account_id=eq.${accountId}&phone_hash=eq.${hash}&name_key=eq.${encodeURIComponent(key)}`,
        svc,
      )
    ).body,
  );
  const prior = priorRows[0];
  const hadHealth = typeof prior?.health_consent_version === "string";
  const hadMarketing = typeof prior?.marketing_consent_version === "string";

  const now = new Date().toISOString();
  const upsert = await fetch(
    // Three-column conflict target since 0032. The payload never mentions
    // name_key — the BEFORE-ROW trigger fills it in ahead of conflict
    // arbitration — so a same-name save updates that person's row and a
    // different-name save inserts a new one instead of overwriting a stranger.
    `${base}/rest/v1/guest_profiles?on_conflict=account_id,phone_hash,name_key`,
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
  if (!upsert.ok) {
    return { status: 500, json: { error: `Could not save preferences (${upsert.status}).` } };
  }

  // Record only tiers that went ON -> OFF. A first-time save, or a save that
  // leaves a tier off that was already off, erases nothing and is not an
  // erasure event.
  const scope: ErasureScope[] = [];
  if (hadHealth && !healthConsent) scope.push("health");
  if (hadMarketing && !contact) scope.push("marketing", "contact");
  if (scope.length > 0) {
    await recordErasure(base, svc, {
      accountId,
      subjectRef: hash,
      channel: "kiosk",
      identityVerification: "In person at the kiosk, guest entered their own phone number",
      scope,
      outcome: "partial",
      executedBySystem: "kiosk-device",
    });
  }
  if (hadMarketing && !contact) {
    await suppressContact(base, svc, accountId, hash, "marketing_withdrawal");
  } else if (contact) {
    // A fresh, in-person marketing opt-in supersedes any earlier objection —
    // the one and only way off the do-not-contact list.
    await clearSuppression(base, svc, accountId, hash);
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
  // Narrowed to one person since 0032. Deleting on the phone alone would now
  // erase every profile sharing the number — a guest withdrawing consent would
  // take a stranger's record with them, which is a data loss far worse than the
  // one this endpoint exists to perform. The caller sends the name it withdrew
  // for; with none, this matches only unnamed rows rather than falling back to
  // the whole number.
  const key = nameKey(sanitizeDisplayName(body.name));
  const del = await fetch(
    `${base}/rest/v1/guest_profiles?account_id=eq.${accountId}&phone_hash=eq.${hash}` +
      `&name_key=eq.${encodeURIComponent(key)}`,
    { method: "DELETE", headers: { ...svc, Prefer: "return=minimal" } },
  );
  if (!del.ok) {
    return { status: 500, json: { error: `Could not delete preferences (${del.status}).` } };
  }
  // Recorded unconditionally, without checking whether a row existed: probing
  // for one would rebuild the existence oracle this endpoint deliberately
  // refuses to be. A record against a phone that was never stored is harmless
  // — it attests to a request, and the request was genuinely made.
  await recordErasure(base, svc, {
    accountId,
    subjectRef: hash,
    channel: "kiosk",
    identityVerification: "In person at the kiosk, guest entered their own phone number",
    scope: FULL_SCOPE,
    executedBySystem: "kiosk-device",
  });
  await suppressContact(base, svc, accountId, hash, "erasure");
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
// with no country code is assumed Polish (+48). Rejects anything under 6
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
  if (digits.length < 6) return null;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 9) return `+48${digits}`; // bare Polish mobile/landline
  return `+${digits}`;
}

export function phoneHash(phone: string, accountId: string, secret: string): string {
  return createHmac("sha256", secret + accountId).update(phone).digest("hex");
}

// The second half of a guest's identity, since 0032. A profile is keyed on
// (account_id, phone_hash, name_key): the same number under the same name is
// the same person returning, the same number under a different name is a
// different person who gets their own profile. Before 0032 the phone alone was
// the key, so the second person to use a number silently overwrote the first.
//
// MUST stay character-for-character identical to guest_profiles_name_key() in
// migration 0032 — the trigger computes the stored value, this computes the
// value we search and upsert against, and any disagreement splits one
// returning guest into two profiles. Note what it does NOT do: no NFD, no
// general accent stripping. JS's NFD cannot decompose 'ł', and Postgres would
// need the unaccent extension to match, so both sides fold exactly these nine
// Polish characters and leave every other accent alone.
const NAME_KEY_FROM = "ąćęłńóśźż";
const NAME_KEY_TO = "acelnoszz";
export function nameKey(raw: string | null | undefined): string {
  const collapsed = (raw ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  let out = "";
  for (const ch of collapsed) {
    const i = NAME_KEY_FROM.indexOf(ch);
    out += i === -1 ? ch : NAME_KEY_TO[i];
  }
  return out;
}

// Cheap junk filter for the numbers guests invent when they would rather not
// give a real one — the case that produced the prod collision behind 0032.
// Runs on the ALREADY-normalized value and inspects the subscriber part (the
// trailing 9 digits of a Polish number), so a country code can't hide a run.
//
// Deliberately narrow: it rejects only patterns nobody is issued (one digit
// repeated, or a strict ascending/descending run). It cannot catch a plausible
// typo — one wrong digit still looks like a real number — which is exactly why
// blocking alone was never enough and the profile identity had to change too.
// Applied on SAVE only: lookup and forget must keep working for numbers that
// were stored before this existed, or a bad row could never be erased.
export function isImplausiblePhone(normalized: string): boolean {
  const digits = normalized.replace(/\D/g, "");
  const local = digits.length > 9 ? digits.slice(-9) : digits;
  if (local.length < 6) return true;
  if (/^(\d)\1+$/.test(local)) return true;
  const run = (step: number) => {
    for (let i = 1; i < local.length; i += 1) {
      if (Number(local[i]) - Number(local[i - 1]) !== step) return false;
    }
    return true;
  };
  return run(1) || run(-1);
}

// Server-side whitelist. Drops any key not in the known set and any zone value
// other than priority/blocked — structural defense so nothing beyond the
// agreed v2 shape can reach the table even if a client sends it. zones/
// zoneNotes/generalNote pass through here — this function has NO consent
// awareness of its own. The caller must enforce the health-consent gate:
// saveGuest strips all three keys unless healthConsent === true, and
// _checkinCore's saveByCode always strips them. Never call this from a path
// without such a gate. Returns null only if the payload isn't an object at
// all.
//
// Exported for api/_checkinCore.ts: the QR check-in save path edits an
// EXISTING (already-consented) profile and needs the same structural
// whitelist without re-running guestCore's own consent-gated saveGuest.
export function sanitizePreferences(input: unknown): StoredPreferencesV1 | null {
  const rec = asRecord(input);
  if (!rec) return null;

  const out: StoredPreferencesV1 = { v: 2 };
  if (rec.bodyGender === "male" || rec.bodyGender === "female") out.bodyGender = rec.bodyGender;
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

// Structural whitelists for the two halves of a guest's identity, split in
// v4/v6 along the tier they now belong to: the display name rides on BASE
// consent, the contact fields on the marketing tier. Both are consent-blind
// like sanitizePreferences — callers gate on the right flag before using
// them. Exported for api/_checkinCore.ts (same sharing pattern as
// sanitizePreferences).
export interface SanitizedContact {
  email: string | null;
  birthday: string | null;
}

const MAX_DISPLAY_NAME_CHARS = 120;
const MAX_EMAIL_CHARS = 254;

// Base tier. Null when no name was captured at all — the profile still saves,
// keyed by phone hash, and stays unnamed until a later visit supplies one. A
// missing name must never cost the guest their remembered preferences.
export function sanitizeDisplayName(name: unknown): string | null {
  const trimmed = typeof name === "string" ? name.trim().slice(0, MAX_DISPLAY_NAME_CHARS) : "";
  return trimmed || null;
}

// Marketing tier. Both fields optional and dropped when malformed rather than
// rejecting the save — the consent is the thing being recorded, and a typo'd
// e-mail must not cost the guest their profile.
export function sanitizeContact(body: { email?: unknown; birthday?: unknown }): SanitizedContact {
  let email: string | null = null;
  if (typeof body.email === "string") {
    const trimmed = body.email.trim().slice(0, MAX_EMAIL_CHARS);
    // Deliberately loose — this is display/marketing data, not an auth channel.
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) email = trimmed;
  }

  let birthday: string | null = null;
  if (typeof body.birthday === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.birthday)) {
    const ms = Date.parse(body.birthday);
    if (!Number.isNaN(ms) && ms < Date.now()) birthday = body.birthday;
  }

  return { email, birthday };
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
