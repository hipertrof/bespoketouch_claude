// Shared logic for the post-treatment survey endpoint, used by both the Vercel
// serverless function (api/survey.ts) and the dev Vite middleware
// (vite-plugins/survey-proxy.ts).
//
// Dependency-free plain fetch against Supabase REST (the SDK crashed the
// serverless function). Underscore-prefixed so Vercel bundles it without
// routing it.
//
// Kiosk-facing and therefore device-token authenticated exactly like
// api/_intakeCore.ts: the tablet presents its token, the server derives the
// location and account. See api/_deviceAuth.ts for the token rule.
//
// Two actions:
//   * sessions — today's intakes for this device's location, so front-desk can
//     attach the survey to the right visit. This is the ONLY way a kiosk can
//     read intakes back: `anon` has no SELECT on the table (0012), and this
//     path is scoped to one location + one day and returns the minimum needed
//     to pick a row.
//   * submit   — write one pseudonymous response.
//
// PRIVACY: the response itself is pseudonymous by construction. It stores the
// intake/therapist/treatment link, never a guest name, phone, or email — so
// feedback can be analysed per therapist and per treatment without ever being
// re-identifiable to the guest who gave it.

import {
  checkDeviceConfig,
  resolveDevice,
  svcHeaders,
  touchLastSeen,
  type DeviceAuthEnv,
} from "./_deviceAuth.js";

export type SurveyEnv = DeviceAuthEnv;

export interface SurveyResult {
  status: number;
  json: unknown;
}

interface SurveyBody {
  action?: string;
  deviceToken?: string;
  intakeId?: unknown;
  therapistId?: unknown;
  therapistName?: unknown;
  treatmentName?: unknown;
  pressureFeedback?: unknown;
  atmosphereComfort?: unknown;
  therapistResponsiveness?: unknown;
  csatStars?: unknown;
  nps?: unknown;
  nextVisitNote?: unknown;
  lang?: unknown;
}

type Headers = Record<string, string>;
type JsonRecord = Record<string, unknown>;

// Mirrors the DB check constraints in 0013. Kept here as the server-side
// whitelist so a hostile client can't smuggle a value past the enum.
const PRESSURE = ["too_light", "just_right", "too_deep"];
const COMFORT = ["yes", "mostly", "no"];
const LANGS = ["pl", "en", "uk", "it", "fr", "de", "es", "id"];

// The free-text answer is the only unbounded field.
const MAX_NOTE_CHARS = 2000;

export async function handleSurvey(
  body: SurveyBody | undefined,
  env: SurveyEnv,
): Promise<SurveyResult> {
  const configError = checkDeviceConfig(env);
  if (configError) return configError;

  const device = await resolveDevice(body?.deviceToken, env);
  if (!device) return { status: 401, json: { error: "This device is not paired." } };

  switch (body?.action) {
    case "sessions":
      return listSessions(device.locationId, env);
    case "submit":
      return submitSurvey(body as SurveyBody, device.locationId, device.tokenId, env);
    default:
      return { status: 400, json: { error: "Unknown or missing action." } };
  }
}

// Today's intakes for this location, newest first — the front-desk picker.
// Deliberately narrow: one location (from the token), one day, and only the
// fields needed to recognise a visit and copy its therapist/treatment onto the
// response.
//
// Visits that have already been surveyed are dropped. The embed counts existing
// responses per intake, and the quota is the party size: a couple shares one
// intake but is two guests, so it legitimately gets two responses. Without this
// the same guest can be surveyed over and over — the list is the only thing
// telling front-desk what's still outstanding.
async function listSessions(locationId: string, env: SurveyEnv): Promise<SurveyResult> {
  const base = env.url.replace(/\/$/, "");
  const since = startOfTodayIso();

  const res = await fetch(
    `${base}/rest/v1/intakes` +
      `?select=id,guest_names,treatment_selections,therapists,party_size,created_at,survey_responses(id)` +
      `&location_id=eq.${locationId}&created_at=gte.${encodeURIComponent(since)}` +
      `&order=created_at.desc&limit=100`,
    { headers: svcHeaders(env) },
  );
  if (!res.ok) {
    return { status: 502, json: { error: `Could not load today's visits (${res.status}).` } };
  }
  const rows = asArray(await res.json().catch(() => null));

  const sessions = rows
    .map((r) => {
      const partySize = r.party_size === 2 ? 2 : 1;
      return {
        id: r.id,
        guestNames: asArray(r.guest_names),
        treatments: asArray(r.treatment_selections).map((t) => ({
          nameI18n: (t as JsonRecord)?.nameI18n ?? null,
        })),
        therapists: asArray(r.therapists),
        partySize,
        responseCount: asArray(r.survey_responses).length,
        createdAt: r.created_at,
      };
    })
    .filter((s) => s.responseCount < s.partySize);

  return { status: 200, json: { sessions } };
}

async function submitSurvey(
  body: SurveyBody,
  locationId: string,
  tokenId: string,
  env: SurveyEnv,
): Promise<SurveyResult> {
  const base = env.url.replace(/\/$/, "");
  const svc = svcHeaders(env);

  // The account is derived from the location, which came from the token — the
  // client never names either.
  const accountId = await resolveAccountId(base, svc, locationId);
  if (!accountId) return { status: 403, json: { error: "Unknown or inactive location." } };

  // A submitted intake link must belong to THIS location, or it isn't used.
  // Without this a paired kiosk could staple its feedback onto another spa's
  // visit, which is the one cross-tenant hole this endpoint could otherwise open.
  //
  // It must also still have room: the list hides fully-surveyed visits, but the
  // list is a snapshot and a tablet can sit on a stale one, so the quota is
  // re-checked here. This is what actually stops one guest being surveyed twice.
  const intakeId = uuidOrNull(body.intakeId);
  let linkedIntake = false;
  if (intakeId) {
    const link = await intakeLinkState(base, svc, intakeId, locationId);
    if (link.full) {
      return { status: 409, json: { error: "This visit has already been surveyed." } };
    }
    linkedIntake = link.atLocation;
  }

  // A therapist rating may only be attributed to a real member of THIS account.
  // Without this a paired token could staple 1-star responses onto any UUID —
  // including another tenant's staff — polluting the manager-only per-therapist
  // ratings /reports groups by therapist_id. A stray/foreign id is dropped to
  // null (the response still counts, just unattributed).
  let therapistId = uuidOrNull(body.therapistId);
  if (therapistId && !(await therapistBelongs(base, svc, therapistId, accountId, locationId))) {
    therapistId = null;
  }

  const payload: JsonRecord = {
    account_id: accountId,
    location_id: locationId,
    intake_id: linkedIntake ? intakeId : null,
    therapist_id: therapistId,
    therapist_name: textOrNull(body.therapistName, 200),
    // Column is `treatment_type` — 0001's name, kept rather than renamed.
    treatment_type: textOrNull(body.treatmentName, 200),
    pressure_feedback: enumOrNull(body.pressureFeedback, PRESSURE),
    atmosphere_comfort: enumOrNull(body.atmosphereComfort, COMFORT),
    therapist_responsiveness: enumOrNull(body.therapistResponsiveness, COMFORT),
    csat_stars: intInRange(body.csatStars, 1, 5),
    nps: intInRange(body.nps, 0, 10),
    next_visit_note: textOrNull(body.nextVisitNote, MAX_NOTE_CHARS),
    lang: enumOrNull(body.lang, LANGS),
  };

  const res = await fetch(`${base}/rest/v1/survey_responses`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return { status: 502, json: { error: `Could not save the survey (${res.status}).` } };
  }

  // Auto-done: the first survey for this visit closes it out on /queue, same
  // as the manual "mark as done" button (which the guest's answers make
  // redundant). Best-effort and fire-once-per-request — a failed PATCH must
  // not fail the survey the guest just gave; front-desk can still mark it done
  // by hand. `status=eq.submitted` makes this a no-op if already done (e.g.
  // the second guest of a couple, or a manual click that beat this request).
  if (linkedIntake && intakeId) {
    markIntakeDone(base, svc, intakeId, locationId);
  }

  touchLastSeen(env, tokenId);
  return { status: 200, json: { ok: true } };
}

function markIntakeDone(base: string, svc: Headers, intakeId: string, locationId: string): void {
  fetch(
    `${base}/rest/v1/intakes?id=eq.${intakeId}&location_id=eq.${locationId}&status=eq.submitted`,
    {
      method: "PATCH",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "done" }),
    },
  ).catch((err) => {
    console.error("[survey] auto-done PATCH failed:", err);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// True iff therapistId is a membership in this account (account-wide or at this
// location). Any role counts — the survey attributes a rating to whoever gave
// the treatment, and a location's roster is small.
async function therapistBelongs(
  base: string,
  svc: Headers,
  therapistId: string,
  accountId: string,
  locationId: string,
): Promise<boolean> {
  const res = await fetch(
    `${base}/rest/v1/memberships?select=id&user_id=eq.${therapistId}` +
      `&account_id=eq.${accountId}&or=(location_id.is.null,location_id.eq.${locationId})`,
    { headers: svc },
  );
  if (!res.ok) return false;
  return asArray(await res.json().catch(() => null)).length > 0;
}

async function resolveAccountId(
  base: string,
  svc: Headers,
  locationId: string,
): Promise<string | null> {
  const res = await fetch(
    `${base}/rest/v1/locations?select=account_id&id=eq.${locationId}&active=is.true`,
    { headers: svc },
  );
  const rows = asArray(await res.json().catch(() => null));
  const accountId = rows[0]?.account_id;
  return typeof accountId === "string" ? accountId : null;
}

// Is this intake ours, and does it still have an unanswered seat? `full` is only
// meaningful when atLocation is true — an intake at another location is simply
// not linked (intake_id null) rather than rejected, so a mis-tap can't lose the
// guest's answers.
async function intakeLinkState(
  base: string,
  svc: Headers,
  intakeId: string,
  locationId: string,
): Promise<{ atLocation: boolean; full: boolean }> {
  const res = await fetch(
    `${base}/rest/v1/intakes?select=id,party_size,survey_responses(id)` +
      `&id=eq.${intakeId}&location_id=eq.${locationId}`,
    { headers: svc },
  );
  const row = asArray(await res.json().catch(() => null))[0];
  if (!row) return { atLocation: false, full: false };
  const partySize = row.party_size === 2 ? 2 : 1;
  return { atLocation: true, full: asArray(row.survey_responses).length >= partySize };
}

// Local midnight is the operator's "today". The kiosk and the spa share a
// timezone in practice; using the server's UTC day would cut the list at 01:00
// or 02:00 local, mid-shift.
function startOfTodayIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function uuidOrNull(v: unknown): string | null {
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v.trim()) ? v.trim() : null;
}

function enumOrNull(v: unknown, allowed: string[]): string | null {
  return typeof v === "string" && allowed.includes(v) ? v : null;
}

function intInRange(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  return v >= min && v <= max ? v : null;
}

function textOrNull(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t.length > 0 ? t : null;
}

function asArray(v: unknown): JsonRecord[] {
  return Array.isArray(v) ? (v as JsonRecord[]) : [];
}
