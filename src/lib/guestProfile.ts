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
// STRUCTURED comfort settings only. Free-text notes (zoneNotes, generalNote)
// are health-adjacent (GDPR Article 9) and are NEVER serialized here — they
// stay on the ephemeral intake. The server re-validates the same whitelist.
// ---------------------------------------------------------------------------

export const STORED_PREFS_VERSION = 1;

// Mirror of api/_guestCore.ts StoredPreferencesV1 (the TS type is canonical
// here; the server validates structurally).
export interface StoredPreferences {
  v: 1;
  pressure?: PressureLevel;
  oilId?: string;
  tableWarming?: boolean;
  headrestPillow?: Preferences["headrestPillow"];
  music?: MusicPreference;
  communication?: CommunicationStyle;
  zones?: Partial<Record<ZoneId, Extract<ZoneMark, "priority" | "blocked">>>;
}

// Serialize the reusable subset of a guest's personalization. Reads ONLY the
// structured preference fields + priority/blocked zone marks; never touches
// zoneNotes or generalNote.
export function toStoredPreferences(p: PersonalizationState): StoredPreferences {
  const zones: Partial<Record<ZoneId, "priority" | "blocked">> = {};
  for (const [zoneId, mark] of Object.entries(p.zones)) {
    if (mark === "priority" || mark === "blocked") zones[zoneId as ZoneId] = mark;
  }
  const stored: StoredPreferences = {
    v: 1,
    pressure: p.preferences.pressure,
    oilId: p.preferences.oilId,
    tableWarming: p.preferences.tableWarming,
    headrestPillow: p.preferences.headrestPillow,
    music: p.preferences.music,
    communication: p.preferences.communication,
  };
  if (Object.keys(zones).length > 0) stored.zones = zones;
  return stored;
}

const PRESSURE_VALUES: PressureLevel[] = ["Lekki", "Średni", "Mocny", "Głęboki"];
const MUSIC_VALUES: MusicPreference[] = ["nature", "ambient", "silence"];
const COMMUNICATION_VALUES: CommunicationStyle[] = ["silent", "guided"];
const PILLOW_VALUES: Preferences["headrestPillow"][] = ["Standardowa", "Ultra-miękka"];

// Validate a stored blob back into a partial preference set + zone marks to
// merge into a guest. Unknown/removed enum values and unknown oils/zones are
// dropped so a corrupt or version-mismatched row can't poison state. Returns
// null for anything that isn't a v1 blob.
export function applyStoredPreferences(stored: unknown): {
  preferences: Partial<Preferences>;
  zones: Partial<Record<ZoneId, ZoneMark>>;
} | null {
  if (!stored || typeof stored !== "object") return null;
  const s = stored as Record<string, unknown>;
  if (s.v !== 1) return null;

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
  return { preferences, zones };
}

function isOneOf<T extends string>(value: unknown, allowed: T[]): value is T {
  return typeof value === "string" && (allowed as string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Endpoint calls. All POST /api/guest with an { action } discriminator. The
// kiosk is anonymous — the server authorizes via the active location, not a JWT.
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

// Returns the stored preferences if a profile exists for this phone at this
// location's account, else null. Raw phone is sent over HTTPS and hashed
// server-side; it is never stored.
export async function lookupGuestProfile(
  locationId: string,
  phone: string,
): Promise<StoredPreferences | null> {
  const json = (await postGuest({ action: "lookup", locationId, phone })) as {
    found?: boolean;
    preferences?: unknown;
  } | null;
  if (!json?.found) return null;
  return (json.preferences as StoredPreferences) ?? null;
}

// Upsert the reusable preference subset under the phone pseudonym. Requires
// explicit consent (the server rejects consent !== true).
export async function saveGuestProfile(
  locationId: string,
  phone: string,
  personalization: PersonalizationState,
): Promise<void> {
  await postGuest({
    action: "save",
    locationId,
    phone,
    consent: true,
    preferences: toStoredPreferences(personalization),
  });
}

// Right-to-erasure: delete this guest's stored profile at this account.
export async function forgetGuestProfile(locationId: string, phone: string): Promise<void> {
  await postGuest({ action: "forget", locationId, phone });
}
