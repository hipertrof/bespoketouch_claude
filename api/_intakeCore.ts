// Shared logic for the kiosk intake-write endpoint, used by both the Vercel
// serverless function (api/intake.ts) and the dev Vite middleware
// (vite-plugins/intake-proxy.ts).
//
// Dependency-free plain fetch against Supabase REST, mirroring _guestCore.ts /
// _deviceCore.ts (the SDK crashed the serverless function). Underscore-prefixed
// so Vercel bundles it without routing it.
//
// PHASE 2 HARDENING — this endpoint replaces the anon RLS insert bridge
// (intakes_insert_anon, dropped in migration 0012). Previously any caller who
// knew a location UUID could insert intakes straight into that spa's therapist
// queue. Now the tablet must present its device token and the server derives the
// location from it: a kiosk can only ever write to the location its slot is
// paired to, and revoking the slot cuts it off instantly.
//
// The client controls the guest's answers; the server controls everything that
// decides where the row lands and how it is treated:
//   * location_id — from the token, never from the body.
//   * status      — pinned to 'submitted' so a caller can't forge queue states.
//   * expires_at  — stamped here so a caller can't opt out of retention.
//
// Note the asymmetry with the guest CRM: an intake legitimately holds free-text
// health notes (that's the therapist handoff). It is protected by short
// retention + no anon SELECT, not by refusing the data.

import {
  checkDeviceConfig,
  resolveDevice,
  svcHeaders,
  touchLastSeen,
  type DeviceAuthEnv,
} from "./_deviceAuth.js";

export type IntakeEnv = DeviceAuthEnv;

export interface IntakeResult {
  status: number;
  json: unknown;
}

interface IntakeBody {
  deviceToken?: string;
  partySize?: unknown;
  guestNames?: unknown;
  treatmentSelections?: unknown;
  personalizations?: unknown;
  therapists?: unknown;
}

// How long a locked intake stays in the queue before the retention job may purge
// it (no job yet — this just stamps the target). Two days covers a same-day
// treatment plus slack for late checkout. Server-side so the kiosk can't extend
// its own retention.
const RETENTION_HOURS = 48;

// A generous ceiling on one intake. Body-map notes are a few sentences per zone;
// anything near this is abuse, not a guest.
const MAX_BODY_BYTES = 64 * 1024;

// Guest names are typed on a tablet keyboard — this only stops absurd payloads.
const MAX_NAME_CHARS = 120;

export async function handleIntake(
  body: IntakeBody | undefined,
  env: IntakeEnv,
): Promise<IntakeResult> {
  const configError = checkDeviceConfig(env);
  if (configError) return configError;

  if (!body || typeof body !== "object") {
    return { status: 400, json: { error: "Missing request body." } };
  }
  if (JSON.stringify(body).length > MAX_BODY_BYTES) {
    return { status: 413, json: { error: "Intake payload too large." } };
  }

  // Identity comes from the token alone. No body-supplied location is accepted.
  const device = await resolveDevice(body.deviceToken, env);
  if (!device) {
    return { status: 401, json: { error: "This device is not paired." } };
  }

  // The location must still be active. Deactivating a location is the operator's
  // kill switch; the guest-CRM and survey cores already gate on it, and intake —
  // the highest-volume write — must not be the one path that keeps filling a
  // closed location's queue until every slot is individually revoked.
  const base = env.url.replace(/\/$/, "");
  const locRes = await fetch(
    `${base}/rest/v1/locations?select=id&id=eq.${device.locationId}&active=is.true`,
    { headers: svcHeaders(env) },
  );
  if (!locRes.ok) {
    return { status: 502, json: { error: "Could not verify the location." } };
  }
  const activeRows = await locRes.json().catch(() => null);
  if (!Array.isArray(activeRows) || activeRows.length === 0) {
    return { status: 403, json: { error: "This location is not active." } };
  }

  const partySize = body.partySize === 1 || body.partySize === 2 ? body.partySize : null;
  if (partySize === null) {
    return { status: 400, json: { error: "Invalid party size." } };
  }

  // Everything index-aligned is clamped to the party size, so a caller can't
  // smuggle extra guests past the size it declared.
  const guestNames = asArray(body.guestNames)
    .slice(0, partySize)
    .map((n) => (typeof n === "string" ? n.trim().slice(0, MAX_NAME_CHARS) : ""));
  const treatmentSelections = asArray(body.treatmentSelections).slice(0, partySize);
  const personalizations = asArray(body.personalizations).slice(0, partySize);
  const therapists = asArray(body.therapists).slice(0, partySize);

  const res = await fetch(`${base}/rest/v1/intakes`, {
    method: "POST",
    headers: { ...svcHeaders(env), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      location_id: device.locationId,
      status: "submitted",
      party_size: partySize,
      guest_names: guestNames,
      treatment_selections: treatmentSelections,
      personalizations,
      therapists,
      expires_at: new Date(Date.now() + RETENTION_HOURS * 3600 * 1000).toISOString(),
    }),
  });

  if (!res.ok) {
    // Surface the status but not Supabase's message — the kiosk is anonymous.
    return { status: 502, json: { error: `Could not save the intake (${res.status}).` } };
  }

  // A successful write is proof of life for the dashboard.
  touchLastSeen(env, device.tokenId);
  return { status: 200, json: { ok: true } };
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
