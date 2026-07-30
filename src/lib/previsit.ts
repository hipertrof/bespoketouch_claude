import { supabase } from "./supabase";
import type { StoredPreferences } from "./guestProfile";
import { normalizeComfort, type ComfortConfig } from "./comfort";
import { ALL_PRESSURE_LEVELS } from "./catalog";
import type { TreatmentSnapshot } from "./intakes";
import type { PressureLevel, RoomAssignment, TherapistAssignment } from "../types";

// Client wrappers for the pre-visit intake link endpoint (/api/previsit —
// api/_previsitCore.ts). previsit_visits is service-role-only, so every read and
// write goes through the endpoint.
//
// Two call styles, matching the endpoint's two authorization models:
//   * the staff actions send the caller's JWT (mirrors src/lib/crm.ts);
//   * previsitLookup/previsitSave run on the GUEST's own device, anonymously,
//     credentialled by the link code plus the phone the spa recorded at booking.

// ---------------------------------------------------------------------------
// Staff calls
// ---------------------------------------------------------------------------

async function postPrevisitAuthed<T>(payload: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");
  const res = await fetch("/api/previsit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg = typeof json?.error === "string" ? json.error : `Request failed (${res.status}).`;
    throw new Error(msg);
  }
  return json as T;
}

// Derived server-side from the row's timestamps, never stored as a column — see
// the migration header for why.
export type PrevisitState = "created" | "filled" | "arrived" | "expired" | "revoked";

export interface PrevisitRow {
  id: string;
  locationId: string;
  guestName: string;
  treatmentSelections: TreatmentSnapshot[];
  therapists: (TherapistAssignment | null)[];
  roomAssignments: (RoomAssignment | null)[];
  createdByName: string;
  createdAt: string;
  expiresAt: string;
  filledAt: string | null;
  convertedAt: string | null;
  convertedIntakeId: string | null;
  failedAttempts: number;
  state: PrevisitState;
}

// Mints a 14-day link for a planned visit. The plaintext code comes back EXACTLY
// once — it is stored only as a hash, so there is no way to retrieve it later.
// A lost link means revoking this visit and creating another.
export async function createPrevisitLink(input: {
  accountId: string;
  locationId: string;
  phone: string;
  guestName: string;
  treatmentSelections: TreatmentSnapshot[];
  therapists: (TherapistAssignment | null)[];
  roomAssignments: (RoomAssignment | null)[];
}): Promise<{ id: string | null; code: string; expiresAt: string }> {
  const json = await postPrevisitAuthed<{ id?: string | null; code?: string; expiresAt?: string }>({
    action: "create",
    ...input,
  });
  if (!json.code || !json.expiresAt) throw new Error("Malformed link response.");
  return { id: json.id ?? null, code: json.code, expiresAt: json.expiresAt };
}

export async function listPrevisitVisits(accountId: string, locationId?: string): Promise<PrevisitRow[]> {
  const json = await postPrevisitAuthed<{ visits?: PrevisitRow[] }>({
    action: "list",
    accountId,
    locationId,
  });
  return json.visits ?? [];
}

export async function revokePrevisitVisit(accountId: string, id: string): Promise<void> {
  await postPrevisitAuthed({ action: "revoke", accountId, id });
}

// The arrival click: turns the planned visit into a real intake, which then
// appears in /queue like any other. Exactly-once server-side — a second call
// fails rather than creating a second intake.
export async function convertPrevisitVisit(
  accountId: string,
  id: string,
): Promise<{ intakeId: string | null }> {
  const json = await postPrevisitAuthed<{ intakeId?: string | null }>({
    action: "convert",
    accountId,
    id,
  });
  return { intakeId: json.intakeId ?? null };
}

// Builds the URL the spa sends the guest. Origin-relative, like the kiosk's QR
// (CheckinQrModal) — no APP_URL secret is needed because the link is always
// minted from a browser that already knows where the app lives.
export function previsitLinkUrl(code: string): string {
  return `${window.location.origin}/previsit?c=${code}`;
}

// ---------------------------------------------------------------------------
// Guest calls — anonymous, code + phone
// ---------------------------------------------------------------------------

async function postPrevisit(payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("/api/previsit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg = typeof json?.error === "string" ? json.error : `Request failed (${res.status}).`;
    throw new Error(msg);
  }
  return json;
}

// What the guest is answering FOR, so the page can show them the spa has the
// right booking rather than presenting a context-free questionnaire.
export interface PrevisitVisitSummary {
  guestName: string;
  locationName: string;
  treatmentName: string | null;
  minutes: number | null;
  therapistName: string | null;
  roomName: string | null;
  bedName: string | null;
}

export interface PrevisitLookup {
  visit: PrevisitVisitSummary;
  // Null for a first-time guest with nothing stored and nothing filled in yet —
  // the page starts them from defaults rather than refusing, unlike /checkin.
  preferences: StoredPreferences | null;
  healthConsent: boolean;
  marketingConsent: boolean;
  name: string | null;
  comfort: ComfortConfig;
  pressureLevels: PressureLevel[];
}

// Opens the link. Throws on an invalid, expired, revoked, already-checked-in or
// attempt-capped link — and on a phone that does not match the one the spa
// recorded, which deliberately returns the SAME error as an unknown link so the
// page cannot be used to test phone numbers.
export async function previsitLookup(code: string, phone: string): Promise<PrevisitLookup> {
  const json = (await postPrevisit({ action: "lookup", code, phone })) as {
    visit?: PrevisitVisitSummary;
    preferences?: unknown;
    healthConsent?: boolean;
    marketingConsent?: boolean;
    name?: unknown;
    comfort?: unknown;
    pressureLevels?: unknown;
  };
  // Order comes from ALL_PRESSURE_LEVELS, not the server's set iteration, so the
  // control always reads soft → firm.
  const offered = Array.isArray(json.pressureLevels) ? json.pressureLevels : null;
  return {
    visit: json.visit ?? {
      guestName: "",
      locationName: "",
      treatmentName: null,
      minutes: null,
      therapistName: null,
      roomName: null,
      bedName: null,
    },
    preferences: (json.preferences as StoredPreferences | null) ?? null,
    healthConsent: json.healthConsent === true,
    marketingConsent: json.marketingConsent === true,
    name: typeof json.name === "string" ? json.name : null,
    comfort: normalizeComfort(json.comfort ?? null),
    pressureLevels: ALL_PRESSURE_LEVELS.filter((p) => !offered || offered.includes(p)),
  };
}

// Saves the guest's answers against the planned visit, and creates or updates
// their CRM profile. Same consent semantics as checkinSave — consent===false
// erases the whole stored profile, healthConsent gates the zone marks and
// free-text notes — with one difference: this one may CREATE a profile, because
// a first-time guest filling in a link before arriving is the point.
//
// The link is NOT consumed: the guest can reopen it and correct something until
// it expires or they are checked in.
export async function previsitSave(
  code: string,
  phone: string,
  preferences: StoredPreferences,
  consent: boolean,
  healthConsent: boolean,
  // Base tier since consent v4 — sent whenever base consent stands.
  name: string,
  // Marketing tier — the presence of this object IS the outreach opt-in.
  contact?: { email?: string },
): Promise<void> {
  await postPrevisit({
    action: "save",
    code,
    phone,
    consent,
    healthConsent,
    marketingConsent: contact !== undefined,
    name: name.trim() || undefined,
    email: contact?.email || undefined,
    preferences,
  });
}
