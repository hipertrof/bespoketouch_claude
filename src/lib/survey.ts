import { supabase } from "./supabase";
import type { LangCode } from "../i18n/translations";

// ---------------------------------------------------------------------------
// Post-treatment survey.
//
// Kiosk side (POST /api/survey) is device-token authenticated — the server
// derives the location from the token, so nothing here names a location.
// Manager side reads survey_responses directly under RLS (0013), which only
// admits owner / manager-of-location / platform admin. Therapists and
// front-desk get zero rows by policy — that IS the "therapists can't see their
// ratings" rule, so don't add a therapist-facing read here without revisiting it.
// ---------------------------------------------------------------------------

export type PressureFeedback = "too_light" | "just_right" | "too_deep";
export type Comfort = "yes" | "mostly" | "no";

// One of today's visits, as offered to front-desk for attachment. Fully
// surveyed visits are filtered out server-side, so anything listed still has an
// unanswered seat. A couple shares one intake but gets two responses, hence
// responseCount/partySize rather than a done flag.
export interface SurveySession {
  id: string;
  guestNames: string[];
  treatments: { nameI18n: Record<string, string> | null }[];
  therapists: ({ id: string; name: string } | null)[];
  partySize: 1 | 2;
  responseCount: number;
  createdAt: string;
}

export interface SurveyAnswers {
  pressureFeedback: PressureFeedback | null;
  atmosphereComfort: Comfort | null;
  therapistResponsiveness: Comfort | null;
  csatStars: number | null;
  nps: number | null;
  nextVisitNote: string;
}

export interface SurveyRow {
  id: string;
  location_id: string;
  intake_id: string | null;
  therapist_id: string | null;
  therapist_name: string | null;
  treatment_type: string | null; // 0001's column name for the treatment snapshot
  pressure_feedback: PressureFeedback | null;
  atmosphere_comfort: Comfort | null;
  therapist_responsiveness: Comfort | null;
  csat_stars: number | null;
  nps: number | null;
  next_visit_note: string | null;
  lang: string | null;
  created_at: string;
}

async function postSurvey(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("/api/survey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new Error(typeof json?.error === "string" ? json.error : `Request failed (${res.status}).`);
  }
  return json ?? {};
}

// Today's visits at this kiosk's location, for the front-desk picker.
export async function fetchSurveySessions(deviceToken: string): Promise<SurveySession[]> {
  const json = await postSurvey({ action: "sessions", deviceToken });
  return (json.sessions as SurveySession[]) ?? [];
}

// Submit one pseudonymous response. Every answer is optional (skippable), so
// nulls are expected and meaningful — not a validation failure.
export async function submitSurvey(input: {
  deviceToken: string;
  intakeId: string | null;
  therapistId: string | null;
  therapistName: string | null;
  treatmentName: string | null;
  lang: LangCode;
  answers: SurveyAnswers;
}): Promise<void> {
  await postSurvey({
    action: "submit",
    deviceToken: input.deviceToken,
    intakeId: input.intakeId,
    therapistId: input.therapistId,
    therapistName: input.therapistName,
    treatmentName: input.treatmentName,
    lang: input.lang,
    pressureFeedback: input.answers.pressureFeedback,
    atmosphereComfort: input.answers.atmosphereComfort,
    therapistResponsiveness: input.answers.therapistResponsiveness,
    csatStars: input.answers.csatStars,
    nps: input.answers.nps,
    nextVisitNote: input.answers.nextVisitNote,
  });
}

// ---------------------------------------------------------------------------
// Manager reporting (RLS-scoped reads)
// ---------------------------------------------------------------------------

export async function fetchSurveyResponses(
  locationId: string,
  sinceDays: number,
): Promise<SurveyRow[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("survey_responses")
    .select("*")
    .eq("location_id", locationId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SurveyRow[];
}

// ---------------------------------------------------------------------------
// Aggregates. Computed client-side over the RLS-scoped rows: the volumes here
// are a few hundred rows per location per month, so a DB rollup would be
// premature. Revisit if a location ever pulls a year at once.
// ---------------------------------------------------------------------------

export interface SurveyStats {
  count: number;
  csatAvg: number | null;
  npsScore: number | null; // -100..100, standard promoters-minus-detractors
  pressureMismatchRate: number | null; // share answering too_light/too_deep
}

export function computeStats(rows: SurveyRow[]): SurveyStats {
  const csat = rows.map((r) => r.csat_stars).filter((v): v is number => v !== null);
  const nps = rows.map((r) => r.nps).filter((v): v is number => v !== null);
  const pressure = rows.map((r) => r.pressure_feedback).filter((v): v is PressureFeedback => v !== null);

  const promoters = nps.filter((v) => v >= 9).length;
  const detractors = nps.filter((v) => v <= 6).length;

  return {
    count: rows.length,
    csatAvg: csat.length ? csat.reduce((a, b) => a + b, 0) / csat.length : null,
    npsScore: nps.length ? Math.round(((promoters - detractors) / nps.length) * 100) : null,
    pressureMismatchRate: pressure.length
      ? pressure.filter((p) => p !== "just_right").length / pressure.length
      : null,
  };
}

export interface TherapistStat {
  therapistId: string | null;
  name: string;
  count: number;
  csatAvg: number | null;
  // Share answering "yes" to "did the therapist listen and focus on the right
  // areas" — the therapist signal. Managers only, per the visibility rule.
  responsiveYesRate: number | null;
}

export function computeByTherapist(rows: SurveyRow[]): TherapistStat[] {
  const groups = new Map<string, SurveyRow[]>();
  for (const r of rows) {
    const key = r.therapist_id ?? `name:${r.therapist_name ?? ""}`;
    if (!r.therapist_id && !r.therapist_name) continue; // unattributed
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  return [...groups.values()]
    .map((list) => {
      const csat = list.map((r) => r.csat_stars).filter((v): v is number => v !== null);
      const resp = list
        .map((r) => r.therapist_responsiveness)
        .filter((v): v is Comfort => v !== null);
      return {
        therapistId: list[0].therapist_id,
        name: list[0].therapist_name ?? "—",
        count: list.length,
        csatAvg: csat.length ? csat.reduce((a, b) => a + b, 0) / csat.length : null,
        responsiveYesRate: resp.length ? resp.filter((v) => v === "yes").length / resp.length : null,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export interface TreatmentStat {
  name: string;
  count: number;
  csatAvg: number | null;
}

export function computeByTreatment(rows: SurveyRow[]): TreatmentStat[] {
  const groups = new Map<string, SurveyRow[]>();
  for (const r of rows) {
    if (!r.treatment_type) continue;
    const list = groups.get(r.treatment_type);
    if (list) list.push(r);
    else groups.set(r.treatment_type, [r]);
  }
  return [...groups.entries()]
    .map(([name, list]) => {
      const csat = list.map((r) => r.csat_stars).filter((v): v is number => v !== null);
      return {
        name,
        count: list.length,
        csatAvg: csat.length ? csat.reduce((a, b) => a + b, 0) / csat.length : null,
      };
    })
    .sort((a, b) => b.count - a.count);
}
