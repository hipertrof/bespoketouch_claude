import type {
  CommunicationStyle,
  MusicPreference,
  PersonalizationState,
  Preferences,
  PressureLevel,
  ZoneId,
  ZoneMark,
} from "../types";
import { oils } from "../data/oils";

// ---------------------------------------------------------------------------
// Opt-in guest CRM (preference memory). Client wrappers around /api/guest and
// the (de)serializer between a guest's in-session PersonalizationState and the
// versioned `preferences` blob stored under an HMAC-of-phone pseudonym.
//
// v1 blobs: structured comfort settings + zone marks only.
// v2 blobs: ALSO include the free-text notes (zoneNotes, generalNote). Those
// are health-adjacent (GDPR Article 9) and are only ever serialized when the
// guest gave EXPLICIT consent to that — the kiosk's consent copy
// (consentSaveBody, i18n) discloses this in plain language before the toggle
// can be switched on. Without consent, notes stay on the ephemeral intake and
// are scrubbed there at done/24h (see supabase/migrations/0018). The server
// re-validates the same whitelist + length caps (api/_guestCore.ts).
// ---------------------------------------------------------------------------

export const STORED_PREFS_VERSION = 2;

// Mirrors of api/_guestCore.ts's StoredPreferences shape (the TS type here is
// canonical; the server validates structurally). v1 rows saved before this
// change lack zoneNotes/generalNote — applyStoredPreferences below reads both.
const MAX_ZONE_NOTE_CHARS = 500;
const MAX_GENERAL_NOTE_CHARS = 1000;

export interface StoredPreferences {
  v: 1 | 2;
  pressure?: PressureLevel;
  oilId?: string;
  tableWarming?: boolean;
  headrestPillow?: Preferences["headrestPillow"];
  music?: MusicPreference;
  communication?: CommunicationStyle;
  zones?: Partial<Record<ZoneId, Extract<ZoneMark, "priority" | "blocked">>>;
  zoneNotes?: Partial<Record<ZoneId, string>>;
  generalNote?: string;
}

// Serialize the reusable subset of a guest's personalization: structured
// preference fields, priority/blocked zone marks, and — this is the v2
// change — the free-text notes, length-capped. Only reachable once the guest
// has given explicit v2 consent (saveGuestProfile is gated on consent===true
// server-side); toStoredPreferences itself has no consent branch because a
// prefilled-but-withdrawn guest never reaches save (see HandoffStep).
export function toStoredPreferences(p: PersonalizationState): StoredPreferences {
  const zones: Partial<Record<ZoneId, "priority" | "blocked">> = {};
  for (const [zoneId, mark] of Object.entries(p.zones)) {
    if (mark === "priority" || mark === "blocked") zones[zoneId as ZoneId] = mark;
  }
  const stored: StoredPreferences = {
    v: 2,
    pressure: p.preferences.pressure,
    oilId: p.preferences.oilId,
    tableWarming: p.preferences.tableWarming,
    headrestPillow: p.preferences.headrestPillow,
    music: p.preferences.music,
    communication: p.preferences.communication,
  };
  if (Object.keys(zones).length > 0) stored.zones = zones;

  const zoneNotes: Partial<Record<ZoneId, string>> = {};
  for (const [zoneId, note] of Object.entries(p.zoneNotes)) {
    const trimmed = note?.trim();
    if (trimmed) zoneNotes[zoneId as ZoneId] = trimmed.slice(0, MAX_ZONE_NOTE_CHARS);
  }
  if (Object.keys(zoneNotes).length > 0) stored.zoneNotes = zoneNotes;

  const generalNote = p.generalNote?.trim();
  if (generalNote) stored.generalNote = generalNote.slice(0, MAX_GENERAL_NOTE_CHARS);

  return stored;
}

const PRESSURE_VALUES: PressureLevel[] = ["Lekki", "Średni", "Mocny", "Głęboki"];
const MUSIC_VALUES: MusicPreference[] = ["nature", "ambient", "silence"];
const COMMUNICATION_VALUES: CommunicationStyle[] = ["silent", "guided"];
const PILLOW_VALUES: Preferences["headrestPillow"][] = ["Standardowa", "Ultra-miękka"];

// Validate a stored blob back into a partial preference set + zone marks (+
// notes, on a v2 blob) to merge into a guest. Unknown/removed enum values and
// unknown oils/zones are dropped so a corrupt or version-mismatched row can't
// poison state. Returns null for anything that isn't a v1 or v2 blob. A v1
// row (saved before notes existed) simply yields no zoneNotes/generalNote.
export function applyStoredPreferences(stored: unknown): {
  preferences: Partial<Preferences>;
  zones: Partial<Record<ZoneId, ZoneMark>>;
  zoneNotes: Partial<Record<ZoneId, string>>;
  generalNote?: string;
} | null {
  if (!stored || typeof stored !== "object") return null;
  const s = stored as Record<string, unknown>;
  if (s.v !== 1 && s.v !== 2) return null;

  const preferences: Partial<Preferences> = {};
  if (isOneOf(s.pressure, PRESSURE_VALUES)) preferences.pressure = s.pressure;
  if (typeof s.oilId === "string" && oils.some((o) => o.id === s.oilId)) {
    preferences.oilId = s.oilId;
  }
  if (typeof s.tableWarming === "boolean") preferences.tableWarming = s.tableWarming;
  if (isOneOf(s.headrestPillow, PILLOW_VALUES)) preferences.headrestPillow = s.headrestPillow;
  if (isOneOf(s.music, MUSIC_VALUES)) preferences.music = s.music;
  if (isOneOf(s.communication, COMMUNICATION_VALUES)) preferences.communication = s.communication;

  const zones: Partial<Record<ZoneId, ZoneMark>> = {};
  if (s.zones && typeof s.zones === "object") {
    for (const [zoneId, mark] of Object.entries(s.zones as Record<string, unknown>)) {
      if (mark === "priority" || mark === "blocked") zones[zoneId as ZoneId] = mark;
    }
  }

  const zoneNotes: Partial<Record<ZoneId, string>> = {};
  if (s.zoneNotes && typeof s.zoneNotes === "object") {
    for (const [zoneId, note] of Object.entries(s.zoneNotes as Record<string, unknown>)) {
      if (typeof note === "string" && note.trim().length > 0) {
        zoneNotes[zoneId as ZoneId] = note.slice(0, MAX_ZONE_NOTE_CHARS);
      }
    }
  }
  const generalNote =
    typeof s.generalNote === "string" && s.generalNote.trim().length > 0
      ? s.generalNote.slice(0, MAX_GENERAL_NOTE_CHARS)
      : undefined;

  return { preferences, zones, zoneNotes, generalNote };
}

function isOneOf<T extends string>(value: unknown, allowed: T[]): value is T {
  return typeof value === "string" && (allowed as string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Endpoint calls. All POST /api/guest with an { action } discriminator. The
// kiosk has no login, but it is not unauthenticated: it presents its paired
// device token and the server derives the location — and the account the
// profile is keyed to — from it. An unpaired tablet gets 401, so the CRM is
// unavailable in the bundled demo by design.
// ---------------------------------------------------------------------------

async function postGuest(payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("/api/guest", {
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

// Returns the stored preferences if a profile exists for this phone at the
// kiosk's account, else null. Raw phone is sent over HTTPS and hashed
// server-side; it is never stored.
export async function lookupGuestProfile(
  deviceToken: string,
  phone: string,
): Promise<StoredPreferences | null> {
  const json = (await postGuest({ action: "lookup", deviceToken, phone })) as {
    found?: boolean;
    preferences?: unknown;
  } | null;
  if (!json?.found) return null;
  return (json.preferences as StoredPreferences) ?? null;
}

// Upsert the reusable preference subset under the phone pseudonym. Requires
// explicit consent (the server rejects consent !== true).
export async function saveGuestProfile(
  deviceToken: string,
  phone: string,
  personalization: PersonalizationState,
): Promise<void> {
  await postGuest({
    action: "save",
    deviceToken,
    phone,
    consent: true,
    preferences: toStoredPreferences(personalization),
  });
}

// Right-to-erasure: delete this guest's stored profile at this account.
export async function forgetGuestProfile(deviceToken: string, phone: string): Promise<void> {
  await postGuest({ action: "forget", deviceToken, phone });
}
