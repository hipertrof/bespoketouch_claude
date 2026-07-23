import type { StoredPreferences } from "./guestProfile";

// ---------------------------------------------------------------------------
// Client wrappers for /api/checkin — the QR self-check-in flow. mintCheckinCode
// runs on the paired kiosk (device-token-authed, like saveIntake/guestProfile);
// checkinLookup/checkinSave run on the guest's own phone, anonymously, using
// only the short-lived code embedded in the scanned QR link.
// ---------------------------------------------------------------------------

async function postCheckin(payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("/api/checkin", {
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

export interface CheckinCode {
  code: string;
  expiresAt: string;
}

// Mints a fresh 15-minute code for the kiosk's own location. Called from the
// welcome step's "show QR" button — device-token-authed like every other
// kiosk write.
export async function mintCheckinCode(deviceToken: string): Promise<CheckinCode> {
  const json = (await postCheckin({ action: "mint", deviceToken })) as {
    code?: string;
    expiresAt?: string;
  };
  if (!json.code || !json.expiresAt) throw new Error("Malformed check-in code response.");
  return { code: json.code, expiresAt: json.expiresAt };
}

// Returns the guest's stored preferences (plus whether the profile carries a
// standing health consent for the zone marks + free-text notes) for this
// code's location, or null if no profile exists for the phone. Throws on an
// invalid/expired/used code (the caller should show a link-level error, not a
// "no profile" message).
export async function checkinLookup(
  code: string,
  phone: string,
): Promise<{ preferences: StoredPreferences; healthConsent: boolean } | null> {
  const json = (await postCheckin({ action: "lookup", code, phone })) as {
    found?: boolean;
    preferences?: unknown;
    healthConsent?: boolean;
  };
  if (!json.found || !json.preferences) return null;
  return {
    preferences: json.preferences as StoredPreferences,
    healthConsent: json.healthConsent === true,
  };
}

// Updates the existing profile's preferences and drops an incomplete intake
// into the location's queue. `consent` (base) and `healthConsent` mirror the
// kiosk's two-toggle model — this path now captures consent itself rather
// than only editing an already-consented profile. consent===false erases the
// whole stored profile (withdrawal), same as the kiosk's HandoffStep forget
// branch; healthConsent gates whether zone marks + free-text notes in
// `preferences` are stored at all. Returns false if no profile exists for
// this phone (save never creates one) — the caller should show the same
// "no profile" state as a lookup miss. Consumes the code: a repeat call will
// fail.
export async function checkinSave(
  code: string,
  phone: string,
  preferences: StoredPreferences,
  consent: boolean,
  healthConsent: boolean,
): Promise<boolean> {
  const json = (await postCheckin({
    action: "save",
    code,
    phone,
    consent,
    healthConsent,
    preferences,
  })) as {
    ok?: boolean;
    found?: boolean;
  };
  if (json.found === false) return false;
  return json.ok === true;
}
