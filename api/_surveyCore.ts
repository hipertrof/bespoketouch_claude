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
async function listSessions(locationId: string, env: SurveyEnv): Promise<SurveyResult> {
  const base = env.url.replace(/\/$/, "");
  const since = startOfTodayIso();

  const res = await fetch(
    `${base}/rest/v1/intakes` +
      `?select=id,guest_names,treatment_selections,therapists,created_at` +
      `&location_id=eq.${locationId}&created_at=gte.${encodeURIComponent(since)}` +
      `&order=created_at.desc&limit=100`,
    { headers: svcHeaders(env) },
  );
  if (!res.ok) {
    return { status: 502, json: { error: `Could not load today's visits (${res.status}).` } };
  }
  const rows = asArray(await res.json().catch(() => null));

  return {
    status: 200,
    json: {
      sessions: rows.map((r) => ({
        id: r.id,
        guestNames: asArray(r.guest_names),
        treatments: asArray(r.treatment_selections).map((t) => ({
          nameI18n: (t as JsonRecord)?.nameI18n ?? null,
        })),
        therapists: asArray(r.therapists),
        createdAt: r.created_at,
      })),
    },
  };
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
  const intakeId = uuidOrNull(body.intakeId);
  const linkedIntake = intakeId ? await intakeAtLocation(base, svc, intakeId, locationId) : false;

  const payload: JsonRecord = {
    account_id: accountId,
    location_id: locationId,
    intake_id: linkedIntake ? intakeId : null,
    therapist_id: uuidOrNull(body.therapistId),
    therapist_name: textOrNull(body.therapistName, 200),
    treatment_name: textOrNull(body.treatmentName, 200),
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

  touchLastSeen(env, tokenId);
  return { status: 200, json: { ok: true } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function intakeAtLocation(
  base: string,
  svc: Headers,
  intakeId: string,
  locationId: string,
): Promise<boolean> {
  const res = await fetch(
    `${base}/rest/v1/intakes?select=id&id=eq.${intakeId}&location_id=eq.${locationId}`,
    { headers: svc },
  );
  return asArray(await res.json().catch(() => null)).length > 0;
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
