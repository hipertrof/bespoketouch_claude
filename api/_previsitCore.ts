// Shared logic for the pre-visit intake link endpoint, used by both the Vercel
// serverless function (api/previsit.ts) and the dev Vite middleware
// (vite-plugins/previsit-proxy.ts).
//
// Dependency-free plain fetch against Supabase REST, mirroring _guestCore.ts /
// _checkinCore.ts / _crmCore.ts (the SDK crashed serverless functions).
// Underscore-prefixed so Vercel bundles it without routing it.
//
// THE FEATURE: reception creates a planned visit, pre-filling exactly the
// fields it would otherwise type on the kiosk's WelcomeStep/TreatmentStep, and
// gets back a link. The spa delivers that link itself — there is deliberately
// NO sending code and no e-mail/SMS sub-processor; `create` returns the code
// once and a staffer copies the URL, exactly as /staff does for staff invites.
// The guest opens it on their own device, confirms their phone, and fills in
// preferences and consent at leisure. On arrival reception calls `convert` and
// the row becomes a normal `intakes` row visible in /queue.
//
// See supabase/migrations/0031_previsit_visits.sql for why this is its own
// table (0018's 24h sweep would scrub the health answers before the guest ever
// arrived) and why state is derived from timestamps rather than a status column.
//
// TWO AUTHORIZATION STYLES IN ONE ENDPOINT:
//   * staff (create/list/revoke/convert) — the caller's JWT, self-authorized
//     against memberships exactly as _crmCore.ts does. Front desk and up,
//     deliberately NOT therapist: minting a link exposes what a guest has
//     stored, and converting one writes an intake.
//   * anonymous (lookup/save) — no login. The credential is TWO parts, unlike
//     /checkin's single QR code, because this link travels over e-mail or SMS
//     and lives for 14 days:
//       1. the code, 128 bits, stored only as sha256;
//       2. the phone the spa recorded at booking, held only as its HMAC.
//     A wrong phone answers with the SAME generic error as an unknown code, so
//     nothing distinguishes the two, and failed_attempts locks the link at 5.
//     Note this is a WEAKER oracle than /checkin's: the submitted phone is
//     compared against one known hash on the row, so a probe learns only "not
//     this booking's number" — there is no guest-existence oracle here at all.
//
// Consent semantics are copied from _checkinCore.ts's saveByCode and must stay
// identical: base off DELETES the profile, health off strips and erases
// zones/notes, marketing off nulls every contact column. The ONE difference is
// deliberate: unlike saveByCode, this path CREATES a guest_profiles row when
// none exists, because the whole point of sending a link ahead is a first-time
// guest filling it in before they walk in. It reuses saveGuest's own
// on_conflict upsert to do it, so reopening the link twice is harmless.

import { randomBytes } from "node:crypto";
import { checkDeviceConfig, svcHeaders, type DeviceAuthEnv } from "./_deviceAuth.js";
import {
  BASE_CONSENT_VERSION,
  HEALTH_CONSENT_VERSION,
  MARKETING_CONSENT_VERSION,
  nameKey,
  normalizePhone,
  phoneHash,
  sanitizeContact,
  sanitizeDisplayName,
  sanitizePreferences,
} from "./_guestCore.js";
import {
  comfortGate,
  fetchComfortConfig,
  fetchOfferedPressureLevels,
  sha256,
  toPersonalizationState,
} from "./_checkinCore.js";
import { pickTreatmentName } from "./_intakeCore.js";
import {
  FULL_SCOPE,
  recordErasure,
  suppressContact,
  type ErasureScope,
} from "./_erasureLog.js";

export interface PrevisitEnv extends DeviceAuthEnv {
  hashSecret: string;
}

export interface PrevisitResult {
  status: number;
  json: unknown;
}

interface PrevisitBody {
  action?: string;
  // Staff actions
  accountId?: string;
  locationId?: string;
  id?: string;
  guestName?: unknown;
  treatmentSelections?: unknown;
  therapists?: unknown;
  roomAssignments?: unknown;
  // Anonymous actions
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

// Long enough to cover a booking made a fortnight out. Anchored to MINTING, not
// to an appointment date, because this product has no appointment entity to
// anchor to — the sharpest limitation of the no-booking-entity approach.
const LINK_TTL_DAYS = 14;
// Wrong-phone attempts before the link is dead. Low, because the phone is the
// only thing protecting a forwarded link and a guest who booked knows their own
// number. Counted atomically via the previsit_register_failure RPC.
const MAX_FAILED_ATTEMPTS = 5;
// Successful opens. Generous — a legitimate guest may revisit the link several
// times over two weeks — but not unbounded.
const MAX_LOOKUPS = 60;
// Per-staffer mint cooldown, the MINT_COOLDOWN_SECONDS idea from _checkinCore
// keyed on a user instead of a device token.
const MINT_COOLDOWN_SECONDS = 3;
// Same retention window a kiosk intake gets (0018 treats every status alike).
const INTAKE_RETENTION_HOURS = 48;
const MAX_LIST_ROWS = 200;

export async function handlePrevisit(
  authorization: string | undefined,
  body: PrevisitBody | undefined,
  env: PrevisitEnv,
): Promise<PrevisitResult> {
  const configError = checkConfig(env);
  if (configError) return configError;

  const base = env.url.replace(/\/$/, "");
  const svc = svcHeaders(env);

  switch (body?.action) {
    // Anonymous: the guest's own device, credentialled by code + phone only.
    case "lookup":
      return lookupByLink(body, env, base, svc);
    case "save":
      return saveByLink(body, env, base, svc);
    // Staff: front desk and up in the named account.
    case "create":
    case "list":
    case "revoke":
    case "convert":
      break;
    default:
      return { status: 400, json: { error: "Unknown or missing action." } };
  }

  const auth = await authorizeStaff(authorization, body.accountId, base, svc);
  if (!auth.ok) return auth.result;

  switch (body.action) {
    case "create":
      return createLink(body, auth, env, base, svc);
    case "list":
      return listLinks(body, auth.accountId, base, svc);
    case "revoke":
      return revokeLink(body, auth.accountId, base, svc);
    default:
      return convertLink(body, auth.accountId, base, svc);
  }
}

// ---------------------------------------------------------------------------
// Authorization — front desk and up in the named account.
// ---------------------------------------------------------------------------
// Copied from _crmCore.ts's authorizeStaff, including resolving the caller's
// name: previsit_visits.created_by_name is an audit trail /checkin's QR mint
// does not have, and "who minted a link against this guest's number" is
// precisely the question it exists to answer.
type StaffAuth =
  | { ok: true; accountId: string; callerId: string; callerName: string }
  | { ok: false; result: PrevisitResult };

async function authorizeStaff(
  authorization: string | undefined,
  accountIdRaw: string | undefined,
  base: string,
  svc: Headers,
): Promise<StaffAuth> {
  const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, result: { status: 401, json: { error: "Missing authorization." } } };

  const accountId = typeof accountIdRaw === "string" && /^[0-9a-f-]{36}$/i.test(accountIdRaw) ? accountIdRaw : null;
  if (!accountId) return { ok: false, result: { status: 400, json: { error: "Missing accountId." } } };

  const caller = await getJson(`${base}/auth/v1/user`, {
    apikey: svc.apikey,
    Authorization: `Bearer ${token}`,
  });
  const callerId = asRecord(caller.body)?.id;
  if (!caller.ok || typeof callerId !== "string") {
    return { ok: false, result: { status: 401, json: { error: "Invalid or expired session." } } };
  }

  const profRows = asArray(
    (await getJson(`${base}/rest/v1/profiles?select=is_platform_admin,full_name,email&user_id=eq.${callerId}`, svc))
      .body,
  );
  const prof = profRows[0];
  const callerName =
    (typeof prof?.full_name === "string" && prof.full_name) ||
    (typeof prof?.email === "string" && prof.email) ||
    "Staff";
  if (prof?.is_platform_admin) return { ok: true, accountId, callerId, callerName };

  // Owner, manager or front desk — the receptionist taking the booking is the
  // person who needs this. Deliberately excludes therapist: see the header.
  const mem = await getJson(
    `${base}/rest/v1/memberships?select=id&user_id=eq.${callerId}` +
      `&account_id=eq.${accountId}&role=in.(owner,manager,frontdesk)`,
    svc,
  );
  if (asArray(mem.body).length === 0) {
    return { ok: false, result: { status: 403, json: { error: "Not authorized for this account's visits." } } };
  }
  return { ok: true, accountId, callerId, callerName };
}

// ---------------------------------------------------------------------------
// create — staff-authed. Mints the link.
// ---------------------------------------------------------------------------

async function createLink(
  body: PrevisitBody,
  auth: { accountId: string; callerId: string; callerName: string },
  env: PrevisitEnv,
  base: string,
  svc: Headers,
): Promise<PrevisitResult> {
  const locationId =
    typeof body.locationId === "string" && /^[0-9a-f-]{36}$/i.test(body.locationId) ? body.locationId : null;
  if (!locationId) return { status: 400, json: { error: "Missing locationId." } };

  // The client names the location; the server decides whether it belongs to the
  // authorized account and is live. Never trust the pairing of the two.
  const locRows = asArray(
    (
      await getJson(
        `${base}/rest/v1/locations?select=id,name&id=eq.${locationId}&account_id=eq.${auth.accountId}&active=is.true`,
        svc,
      )
    ).body,
  );
  if (!locRows[0]) return { status: 403, json: { error: "Unknown or inactive location." } };

  const guestName = typeof body.guestName === "string" ? body.guestName.trim().slice(0, 120) : "";
  if (!guestName) return { status: 400, json: { error: "A guest name is required." } };

  // Same bar as CompleteIntakeModal's canSave: without a treatment the link
  // describes no visit, and conversion would produce an intake reception still
  // has to finish by hand — which is the flow this feature replaces.
  const treatmentSelections = asArray(body.treatmentSelections);
  if (treatmentSelections.length === 0) {
    return { status: 400, json: { error: "A treatment is required." } };
  }
  const therapists = Array.isArray(body.therapists) ? body.therapists : [null];
  const roomAssignments = Array.isArray(body.roomAssignments) ? body.roomAssignments : [null];

  const phone = normalizePhone(body.phone);
  if (!phone) return { status: 400, json: { error: "Invalid phone number." } };

  // Cooldown so a compromised or scripted staff session cannot churn out an
  // unbounded number of live links.
  const since = new Date(Date.now() - MINT_COOLDOWN_SECONDS * 1000).toISOString();
  const recent = await getJson(
    `${base}/rest/v1/previsit_visits?select=id&created_by=eq.${auth.callerId}&created_at=gte.${since}`,
    svc,
  );
  if (asArray(recent.body).length > 0) {
    return { status: 429, json: { error: "Please wait a moment before creating another link." } };
  }

  // The plaintext code exists exactly once, in the response. Losing it means
  // revoking and re-creating — there is no recovery path by design.
  const code = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 24 * 3600 * 1000).toISOString();

  const res = await fetch(`${base}/rest/v1/previsit_visits`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      account_id: auth.accountId,
      location_id: locationId,
      code_hash: sha256(code),
      subject_ref: phoneHash(phone, auth.accountId, env.hashSecret),
      guest_name: guestName,
      treatment_selections: treatmentSelections,
      therapists,
      room_assignments: roomAssignments,
      created_by: auth.callerId,
      created_by_name: auth.callerName,
      expires_at: expiresAt,
    }),
  });
  if (!res.ok) {
    return { status: 502, json: { error: `Could not create the link (${res.status}).` } };
  }
  const inserted = asArray(await res.json().catch(() => null))[0];

  return {
    status: 201,
    json: { ok: true, id: inserted?.id ?? null, code, expiresAt },
  };
}

// ---------------------------------------------------------------------------
// list — staff-authed.
// ---------------------------------------------------------------------------

async function listLinks(
  body: PrevisitBody,
  accountId: string,
  base: string,
  svc: Headers,
): Promise<PrevisitResult> {
  // Never selects code_hash, subject_ref, or personalizations. The first two are
  // credentials; the third is the guest's health data, which has no business on
  // a list screen — it reaches staff through /queue after conversion, where
  // IntakePanel and 0018's scrub already govern it.
  let url =
    `${base}/rest/v1/previsit_visits?select=id,location_id,guest_name,treatment_selections,therapists,` +
    `room_assignments,created_by_name,created_at,expires_at,filled_at,revoked_at,converted_at,` +
    `converted_intake_id,failed_attempts&account_id=eq.${accountId}` +
    `&order=created_at.desc&limit=${MAX_LIST_ROWS}`;
  if (typeof body.locationId === "string" && /^[0-9a-f-]{36}$/i.test(body.locationId)) {
    url += `&location_id=eq.${body.locationId}`;
  }
  const res = await getJson(url, svc);
  if (!res.ok) return { status: 502, json: { error: `Could not load visits (${res.status}).` } };

  const now = Date.now();
  const visits = asArray(res.body).map((row) => ({
    id: row.id,
    locationId: row.location_id,
    guestName: row.guest_name,
    treatmentSelections: row.treatment_selections,
    therapists: row.therapists,
    roomAssignments: row.room_assignments,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    filledAt: row.filled_at,
    convertedAt: row.converted_at,
    convertedIntakeId: row.converted_intake_id,
    failedAttempts: row.failed_attempts,
    // Derived, never stored — see the migration header. Order matters: a
    // converted row stays "arrived" even once its expiry passes.
    state: row.converted_at
      ? "arrived"
      : row.revoked_at
        ? "revoked"
        : typeof row.expires_at === "string" && Date.parse(row.expires_at) < now
          ? "expired"
          : row.filled_at
            ? "filled"
            : "created",
  }));
  return { status: 200, json: { visits } };
}

// ---------------------------------------------------------------------------
// revoke — staff-authed.
// ---------------------------------------------------------------------------

async function revokeLink(body: PrevisitBody, accountId: string, base: string, svc: Headers): Promise<PrevisitResult> {
  const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  if (!id) return { status: 400, json: { error: "Missing id." } };

  // account_id in the filter is the tenant check: an id alone must never cross
  // accounts. return=representation so a zero-row result is distinguishable
  // from a success (the RLS-no-op lesson from CLAUDE.md, same shape here).
  const res = await fetch(
    `${base}/rest/v1/previsit_visits?id=eq.${id}&account_id=eq.${accountId}&converted_at=is.null`,
    {
      method: "PATCH",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    },
  );
  if (!res.ok) return { status: 502, json: { error: `Could not revoke the link (${res.status}).` } };
  if (asArray(await res.json().catch(() => null)).length === 0) {
    return { status: 404, json: { error: "This visit no longer exists or has already been checked in." } };
  }
  return { status: 200, json: { ok: true } };
}

// ---------------------------------------------------------------------------
// convert — staff-authed. The arrival click.
// ---------------------------------------------------------------------------

async function convertLink(
  body: PrevisitBody,
  accountId: string,
  base: string,
  svc: Headers,
): Promise<PrevisitResult> {
  const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  if (!id) return { status: 400, json: { error: "Missing id." } };

  // Claim it FIRST, atomically, before writing anything: converted_at is.null
  // means a double-tapped arrival button cannot create two intakes. Exactly the
  // used_at is.null idiom from _checkinCore's save.
  const claim = await fetch(
    `${base}/rest/v1/previsit_visits?id=eq.${id}&account_id=eq.${accountId}` +
      `&converted_at=is.null&revoked_at=is.null`,
    {
      method: "PATCH",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ converted_at: new Date().toISOString() }),
    },
  );
  if (!claim.ok) {
    return { status: 502, json: { error: `Could not check in this visit (${claim.status}).` } };
  }
  const row = asArray(await claim.json().catch(() => null))[0];
  if (!row) {
    return { status: 409, json: { error: "This visit has already been checked in, or was revoked." } };
  }
  const locationId = String(row.location_id);

  // A guest who never opened the link must still be checkable-in: fall back to
  // a comfort-default personalization built the same way the QR path builds one,
  // so /queue shows a normal row rather than an empty one.
  let personalizations = asArray(row.personalizations);
  if (personalizations.length === 0) {
    const gate = comfortGate(await fetchComfortConfig(base, svc, locationId));
    personalizations = [toPersonalizationState({ v: 2 }, gate)];
  }

  const res = await fetch(`${base}/rest/v1/intakes`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      location_id: locationId,
      status: "submitted",
      party_size: 1,
      guest_names: [row.guest_name],
      treatment_selections: row.treatment_selections ?? [],
      personalizations,
      therapists: row.therapists ?? [null],
      room_assignments: row.room_assignments ?? [null],
      expires_at: new Date(Date.now() + INTAKE_RETENTION_HOURS * 3600 * 1000).toISOString(),
    }),
  });
  if (!res.ok) {
    return { status: 502, json: { error: `Could not create the intake (${res.status}).` } };
  }
  const intake = asArray(await res.json().catch(() => null))[0];
  const intakeId = typeof intake?.id === "string" ? intake.id : null;

  // Null the health data now it has moved: after arrival it lives in exactly one
  // place, under 0018's scrub/sweep lifecycle. Best-effort — the guest is
  // already checked in and a failed tidy-up must not undo that.
  await fetch(`${base}/rest/v1/previsit_visits?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ converted_intake_id: intakeId, personalizations: null }),
  }).catch(() => {});

  // Durable visit history (0025), FULL detail — unlike the QR path, which writes
  // a detail-less row because reception hasn't picked a treatment yet. Here
  // everything was known at mint time, so there is no excuse for a blank row.
  // Best-effort, and never creates a profile.
  await writeVisit(base, svc, {
    accountId,
    locationId,
    intakeId,
    subjectRef: String(row.subject_ref ?? ""),
    guestName: typeof row.guest_name === "string" ? row.guest_name : null,
    treatmentSelection: asRecord(asArray(row.treatment_selections)[0]),
    therapist: asRecord(asArray(row.therapists)[0]),
    room: asRecord(asArray(row.room_assignments)[0]),
  }).catch(() => {});

  return { status: 200, json: { ok: true, intakeId } };
}

async function writeVisit(
  base: string,
  svc: Headers,
  args: {
    accountId: string;
    locationId: string;
    intakeId: string | null;
    subjectRef: string;
    guestName: string | null;
    treatmentSelection: JsonRecord | null;
    therapist: JsonRecord | null;
    room: JsonRecord | null;
  },
): Promise<void> {
  if (!args.subjectRef) return;
  const profRows = asArray(
    (
      await getJson(
        `${base}/rest/v1/guest_profiles?select=id&account_id=eq.${args.accountId}` +
          `&phone_hash=eq.${args.subjectRef}` +
          `&name_key=eq.${encodeURIComponent(nameKey(sanitizeDisplayName(args.guestName)))}`,
        svc,
      )
    ).body,
  );
  // Narrowed by the booking name since 0032, and required to be unambiguous:
  // profRows[0] would file this treatment and its price against whichever of
  // several people on the number came back first. Keyed on the name reception
  // recorded at booking, which is also what the pre-visit page prefills, so it
  // matches unless the guest renamed themselves on the link.
  const guestId =
    profRows.length === 1 && typeof profRows[0]?.id === "string" ? profRows[0].id : null;
  // No consented profile means no visit history to write — and this path must
  // never originate one, exactly like _intakeCore's writeGuestVisits.
  if (!guestId) return;

  const locRows = asArray(
    (await getJson(`${base}/rest/v1/locations?select=name&id=eq.${args.locationId}`, svc)).body,
  );
  const sel = args.treatmentSelection;

  await fetch(`${base}/rest/v1/guest_visits`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      account_id: args.accountId,
      location_id: args.locationId,
      location_name: typeof locRows[0]?.name === "string" ? locRows[0].name : "",
      guest_id: guestId,
      intake_id: args.intakeId,
      treatment_name: pickTreatmentName(sel),
      treatment_price: typeof sel?.price === "number" ? sel.price : null,
      duration_min: typeof sel?.minutes === "number" ? sel.minutes : null,
      therapist_id: typeof args.therapist?.id === "string" ? args.therapist.id : null,
      therapist_name: typeof args.therapist?.name === "string" ? args.therapist.name : null,
      room_name: typeof args.room?.roomName === "string" ? args.room.roomName : null,
      bed_name: typeof args.room?.bedName === "string" ? args.room.bedName : null,
    }),
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// lookup — anonymous, code + phone.
// ---------------------------------------------------------------------------

async function lookupByLink(
  body: PrevisitBody,
  env: PrevisitEnv,
  base: string,
  svc: Headers,
): Promise<PrevisitResult> {
  const resolved = await resolveLink(body.code, body.phone, env, base, svc);
  if (!resolved.ok) return resolved.result;
  const { row, locationId, accountId, subjectRef } = resolved;

  // What the guest is answering FOR. Without this the page is a context-free
  // questionnaire; with it they can see the spa has the right booking.
  const sel = asRecord(asArray(row.treatment_selections)[0]);
  const ther = asRecord(asArray(row.therapists)[0]);
  const room = asRecord(asArray(row.room_assignments)[0]);
  const locRows = asArray(
    (await getJson(`${base}/rest/v1/locations?select=name&id=eq.${locationId}`, svc)).body,
  );

  // Start from what the guest already submitted through this link if they are
  // coming back to edit it; otherwise from what the spa remembers about them.
  const filled = asRecord(asArray(row.personalizations)[0]);
  let preferences: JsonRecord | null = null;
  let healthConsent = false;
  let marketingConsent = false;
  let name: string | null = null;

  const profRows = asArray(
    (
      await getJson(
        `${base}/rest/v1/guest_profiles?select=preferences,health_consent_version,marketing_consent_version,` +
          `display_name&account_id=eq.${accountId}&phone_hash=eq.${subjectRef}`,
        svc,
      )
    ).body,
  );
  const prof = profRows[0];
  if (prof) {
    healthConsent = typeof prof.health_consent_version === "string";
    marketingConsent = typeof prof.marketing_consent_version === "string";
    name = typeof prof.display_name === "string" ? prof.display_name : null;
    preferences = asRecord(prof.preferences);
    // Defence in depth, same as _checkinCore's lookup: strip the Art. 9 keys on
    // the way out whenever the stored row carries no standing health consent.
    if (preferences && !healthConsent) {
      delete preferences.zones;
      delete preferences.zoneNotes;
      delete preferences.generalNote;
    }
  }
  if (filled) {
    // A reopen shows their own last answers, which may be newer than the
    // profile (a save with base consent off writes here but deletes that).
    const fromFilled = asRecord(filled.preferences) ?? {};
    preferences = {
      // StoredPreferences carries its version; the personalization shape this
      // is being rebuilt from does not, so stamp it (the server re-stamps on
      // save anyway — this keeps the client's type contract honest).
      v: 2,
      ...fromFilled,
      bodyGender: filled.bodyGender,
      ...(healthConsent
        ? { zones: filled.zones, zoneNotes: filled.zoneNotes, generalNote: filled.generalNote }
        : {}),
    };
  }
  // Reception typed a name at booking; use it when the CRM has none, so the
  // page can greet the guest and the base-consent name field is prefilled.
  if (!name && typeof row.guest_name === "string") name = row.guest_name;

  return {
    status: 200,
    json: {
      found: true,
      visit: {
        guestName: row.guest_name,
        locationName: typeof locRows[0]?.name === "string" ? locRows[0].name : "",
        treatmentName: pickTreatmentName(sel),
        minutes: typeof sel?.minutes === "number" ? sel.minutes : null,
        therapistName: typeof ther?.name === "string" ? ther.name : null,
        roomName: typeof room?.roomName === "string" ? room.roomName : null,
        bedName: typeof room?.bedName === "string" ? room.bedName : null,
      },
      preferences,
      healthConsent,
      marketingConsent,
      name,
      comfort: await fetchComfortConfig(base, svc, locationId),
      pressureLevels: await fetchOfferedPressureLevels(base, svc, locationId),
    },
  };
}

// ---------------------------------------------------------------------------
// save — anonymous, code + phone. UNLIKE _checkinCore's save, this one may
// CREATE a guest_profiles row: a first-time guest filling in a link ahead of
// their visit is the main reason the feature exists.
// ---------------------------------------------------------------------------

async function saveByLink(
  body: PrevisitBody,
  env: PrevisitEnv,
  base: string,
  svc: Headers,
): Promise<PrevisitResult> {
  const sanitized = sanitizePreferences(body.preferences);
  if (!sanitized) return { status: 400, json: { error: "Invalid preferences payload." } };

  // Same nesting as the kiosk (GuestContext's SET_GUEST_CONSENT) and /checkin:
  // health is nested under base and forced off without it.
  const consent = body.consent === true;
  const healthConsent = consent && body.healthConsent === true;

  // sanitizePreferences is structural and consent-blind, so the Art. 9 keys
  // (zone marks count, even with no text attached) are stripped here.
  if (!healthConsent) {
    delete sanitized.zones;
    delete sanitized.zoneNotes;
    delete sanitized.generalNote;
  }

  const resolved = await resolveLink(body.code, body.phone, env, base, svc);
  if (!resolved.ok) return resolved.result;
  const { row, locationId, accountId, subjectRef, phone } = resolved;

  // A device cannot smuggle a comfort field the location has switched off past
  // the structural-only sanitizer — stripDisabled's server-side half.
  const gate = comfortGate(await fetchComfortConfig(base, svc, locationId));
  if (!gate.offers("oil")) delete sanitized.oilId;
  if (!gate.offers("music")) delete sanitized.music;
  if (!gate.offers("pillow")) delete sanitized.headrestPillow;
  if (!gate.offers("tableWarming")) delete sanitized.tableWarming;
  if (!gate.offers("communication")) delete sanitized.communication;

  // Prior stamps, read BEFORE the write: the upsert below is a whole-row merge,
  // so a save with a tier switched off silently erases that tier's data. Without
  // this read the write cannot tell a brand-new guest from a withdrawal, and the
  // erasure would go unrecorded. Same deliberate extra request as saveGuest.
  // (phone, name) is the identity since 0032, so both the read below and every
  // write in this function are narrowed to this one person. Hoisted above the
  // consent branch because the withdrawal path needs the same key: deleting on
  // the phone alone would erase every profile sharing the number, taking a
  // stranger's record along with the guest's own.
  const displayName = sanitizeDisplayName(body.name);
  // Required since 0032, as on the other two save paths. In practice always
  // present here — reception recorded a name at booking and the page prefills
  // it — so this only fires if the guest clears the field.
  if (!displayName) {
    return {
      status: 400,
      json: { error: "A name is required.", code: "name_required" },
    };
  }
  const key = nameKey(displayName);
  const priorRows = asArray(
    (
      await getJson(
        `${base}/rest/v1/guest_profiles?select=id,health_consent_version,marketing_consent_version` +
          `&account_id=eq.${accountId}&phone_hash=eq.${subjectRef}&name_key=eq.${encodeURIComponent(key)}`,
        svc,
      )
    ).body,
  );
  const prior = priorRows[0];
  const existed = Boolean(prior);
  const hadHealth = typeof prior?.health_consent_version === "string";
  const hadMarketing = typeof prior?.marketing_consent_version === "string";

  const now = new Date().toISOString();
  const identityVerification =
    "Guest's own device, authenticated by the pre-visit link plus the phone number the spa recorded at booking";

  if (!consent) {
    // Withdrawal. Deleting a row that never existed is a harmless no-op, and
    // the erasure is still recorded — it attests to a request that was made.
    const del = await fetch(
      `${base}/rest/v1/guest_profiles?account_id=eq.${accountId}&phone_hash=eq.${subjectRef}` +
        `&name_key=eq.${encodeURIComponent(key)}`,
      { method: "DELETE", headers: { ...svc, Prefer: "return=minimal" } },
    );
    if (!del.ok) {
      return { status: 500, json: { error: `Could not delete preferences (${del.status}).` } };
    }
    if (existed) {
      await recordErasure(base, svc, {
        accountId,
        subjectRef,
        channel: "previsit",
        identityVerification,
        scope: FULL_SCOPE,
        executedBySystem: "previsit-link",
      });
      await suppressContact(base, svc, accountId, subjectRef, "erasure");
    }
  } else {
    const contact = body.marketingConsent === true ? sanitizeContact(body) : null;

    // saveGuest's own upsert, verbatim: this is what lets the pre-visit path
    // CREATE a profile for a first-time guest, and it makes reopening the link
    // twice harmless — (account_id, phone_hash, name_key) is the conflict
    // target since 0032, not a race to lose. Reopening under the same name
    // still updates the one row; a different name on a shared household number
    // now adds a profile instead of overwriting whoever was there first.
    const upsert = await fetch(`${base}/rest/v1/guest_profiles?on_conflict=account_id,phone_hash,name_key`, {
      method: "POST",
      headers: {
        ...svc,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        account_id: accountId,
        phone_hash: subjectRef,
        preferences: sanitized,
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
    });
    if (!upsert.ok) {
      return { status: 500, json: { error: `Could not save preferences (${upsert.status}).` } };
    }

    // Only ON -> OFF transitions are erasures. A first save, or a tier that was
    // already off, erases nothing.
    const scope: ErasureScope[] = [];
    if (hadHealth && !healthConsent) scope.push("health");
    if (hadMarketing && !contact) scope.push("marketing", "contact");
    if (scope.length > 0) {
      await recordErasure(base, svc, {
        accountId,
        subjectRef,
        channel: "previsit",
        identityVerification,
        scope,
        outcome: "partial",
        executedBySystem: "previsit-link",
      });
    }
    if (hadMarketing && !contact) {
      await suppressContact(base, svc, accountId, subjectRef, "marketing_withdrawal");
    }
    // Deliberately NO clearSuppression here, unlike the kiosk and /checkin. The
    // do-not-contact list is cleared only by a fresh IN-PERSON opt-in, and a
    // guest at home behind a forwardable link is not that. The consent stamp
    // above is recorded truthfully; the objection simply outlives it until they
    // opt in on site. Costs nothing today — nothing sends yet.
  }

  // Always record the answers against the planned visit, even on withdrawal:
  // the comfort preferences still apply to the treatment they are about to have,
  // and reception must still be able to check them in.
  const patch = await fetch(`${base}/rest/v1/previsit_visits?id=eq.${String(row.id)}&converted_at=is.null`, {
    method: "PATCH",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      personalizations: [toPersonalizationState(sanitized, gate)],
      filled_at: now,
    }),
  });
  if (!patch.ok) {
    return { status: 500, json: { error: `Could not save the visit details (${patch.status}).` } };
  }
  if (asArray(await patch.json().catch(() => null)).length === 0) {
    return { status: 410, json: { error: "This visit has already been checked in." } };
  }

  // The code is NOT claimed: reusable until expiry, so the guest can come back
  // and correct something before they arrive.
  return { status: 200, json: { ok: true } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ResolvedLink =
  | {
      ok: true;
      row: JsonRecord;
      locationId: string;
      accountId: string;
      subjectRef: string;
      phone: string;
    }
  | { ok: false; result: PrevisitResult };

// The single definition of "valid link", mirroring _deviceAuth's resolveDevice
// and _checkinCore's resolveCode. BOTH halves of the credential are checked
// here so no action can accidentally accept one without the other.
async function resolveLink(
  rawCode: unknown,
  rawPhone: unknown,
  env: PrevisitEnv,
  base: string,
  svc: Headers,
): Promise<ResolvedLink> {
  // The one error that is safe to be specific about: a malformed code cannot
  // have come from a link we issued, so it leaks nothing.
  if (typeof rawCode !== "string" || !/^[0-9a-f]{32}$/i.test(rawCode)) {
    return { ok: false, result: { status: 400, json: { error: "Invalid or missing link." } } };
  }
  const codeHash = sha256(rawCode);
  const invalid: PrevisitResult = { status: 404, json: { error: "This link is invalid." } };

  const rows = asArray(
    (
      await getJson(
        `${base}/rest/v1/previsit_visits?select=id,account_id,location_id,subject_ref,guest_name,` +
          `treatment_selections,therapists,room_assignments,personalizations,expires_at,revoked_at,` +
          `converted_at,lookup_count,failed_attempts&code_hash=eq.${codeHash}`,
        svc,
      )
    ).body,
  );
  const row = rows[0];
  if (!row) return { ok: false, result: invalid };

  if (row.revoked_at) {
    return { ok: false, result: { status: 410, json: { error: "This link is no longer valid." } } };
  }
  if (row.converted_at) {
    return { ok: false, result: { status: 410, json: { error: "This visit has already been checked in." } } };
  }
  if (typeof row.expires_at !== "string" || Date.parse(row.expires_at) < Date.now()) {
    return { ok: false, result: { status: 410, json: { error: "This link has expired." } } };
  }
  const failed = typeof row.failed_attempts === "number" ? row.failed_attempts : 0;
  if (failed >= MAX_FAILED_ATTEMPTS) {
    return { ok: false, result: { status: 429, json: { error: "Too many attempts with this link." } } };
  }
  const lookups = typeof row.lookup_count === "number" ? row.lookup_count : 0;
  if (lookups >= MAX_LOOKUPS) {
    return { ok: false, result: { status: 429, json: { error: "Too many attempts with this link." } } };
  }

  // Second half of the credential. A forwarded link is useless without it.
  const phone = normalizePhone(typeof rawPhone === "string" ? rawPhone : undefined);
  const accountId = String(row.account_id);
  const subjectRef = String(row.subject_ref ?? "");
  if (!phone || !subjectRef || phoneHash(phone, accountId, env.hashSecret) !== subjectRef) {
    // Atomic, because this counter is the brute-force lock. Then answer with
    // the SAME error an unknown code gets: nothing distinguishes "wrong link"
    // from "wrong number", so the link cannot be used to test phone numbers.
    await fetch(`${base}/rest/v1/rpc/previsit_register_failure`, {
      method: "POST",
      headers: { ...svc, "Content-Type": "application/json" },
      body: JSON.stringify({ p_code_hash: codeHash }),
    }).catch(() => {});
    return { ok: false, result: invalid };
  }

  // Successful opens are a metric, not a gate — best-effort, like
  // checkin_codes.lookup_count.
  fetch(`${base}/rest/v1/previsit_visits?id=eq.${String(row.id)}`, {
    method: "PATCH",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ lookup_count: lookups + 1 }),
  }).catch(() => {});

  return {
    ok: true,
    row,
    locationId: String(row.location_id),
    accountId,
    subjectRef,
    phone,
  };
}

function checkConfig(env: PrevisitEnv): PrevisitResult | null {
  // Shared guard against a PUBLIC key pasted where the service_role secret
  // belongs — this endpoint bypasses RLS entirely, so a wrong key must fail
  // loudly rather than silently deny everything.
  const keyError = checkDeviceConfig(env);
  if (keyError) return keyError;
  if (!env.hashSecret) {
    return { status: 500, json: { error: "Server not configured: GUEST_HASH_SECRET is missing." } };
  }
  return null;
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
