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
import { nameKey, normalizePhone, phoneHash } from "./_guestCore.js";

export interface IntakeEnv extends DeviceAuthEnv {
  // Needed to hash guestPhones for the guest_visits write (0025). Optional so
  // an unset local .env degrades to "no visit history", not a dead endpoint.
  hashSecret?: string;
}

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
  roomAssignments?: unknown;
  // Index-aligned raw phones, sent ONLY for guests who engaged the CRM this
  // session (base consent). Used to key the guest_visits history write —
  // hashed immediately, never stored raw here.
  guestPhones?: unknown;
  guestCrmNames?: unknown;
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
  const roomAssignments = asArray(body.roomAssignments)
    .slice(0, partySize)
    .map(sanitizeRoomAssignment);

  const guestPhones = asArray(body.guestPhones).slice(0, partySize);
  // Index-aligned with guestPhones: the name each guest's CRM profile was saved
  // under. Needed since 0032, where (phone, name) — not the phone alone —
  // identifies a profile, so the visit-history write below can tell which of
  // several people on a shared number this visit belongs to. Distinct from
  // guestNames: that is the name reception typed on the intake, which the guest
  // can edit on the consent card before saving.
  const guestCrmNames = asArray(body.guestCrmNames).slice(0, partySize);

  // return=representation: the new intake's id keys the guest_visits history
  // rows (0025) and the later survey linkage.
  const res = await fetch(`${base}/rest/v1/intakes`, {
    method: "POST",
    headers: { ...svcHeaders(env), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      location_id: device.locationId,
      status: "submitted",
      party_size: partySize,
      guest_names: guestNames,
      treatment_selections: treatmentSelections,
      personalizations,
      therapists,
      room_assignments: roomAssignments,
      expires_at: new Date(Date.now() + RETENTION_HOURS * 3600 * 1000).toISOString(),
    }),
  });

  if (!res.ok) {
    // Surface the status but not Supabase's message — the kiosk is anonymous.
    return { status: 502, json: { error: `Could not save the intake (${res.status}).` } };
  }

  // Durable visit history (0025): for each guest who used the CRM this session
  // (a raw phone at their index), find their consented profile and snapshot the
  // non-health visit facts. Best-effort — a failed visit write must never fail
  // the intake, and no profile is ever CREATED here.
  const inserted = (await res.json().catch(() => null)) as Array<{ id?: unknown }> | null;
  const intakeId = typeof inserted?.[0]?.id === "string" ? inserted[0].id : null;
  if (env.hashSecret && guestPhones.some((p) => typeof p === "string" && p)) {
    await writeGuestVisits(env, base, {
      locationId: device.locationId,
      intakeId,
      guestPhones,
      guestCrmNames,
      treatmentSelections,
      therapists,
      roomAssignments,
    }).catch(() => {});
  }

  // A successful write is proof of life for the dashboard.
  touchLastSeen(env, device.tokenId);
  return { status: 200, json: { ok: true } };
}

// One guest_visits row per phone-bearing guest with an existing consented
// profile. Snapshots (name strings, price) mirror the room-assignment
// philosophy: history must survive later renames/deletes.
async function writeGuestVisits(
  env: IntakeEnv,
  base: string,
  args: {
    locationId: string;
    intakeId: string | null;
    guestPhones: unknown[];
    guestCrmNames: unknown[];
    treatmentSelections: unknown[];
    therapists: unknown[];
    roomAssignments: Array<ReturnType<typeof sanitizeRoomAssignment>>;
  },
): Promise<void> {
  const svc = svcHeaders(env);
  const locRows = (await (
    await fetch(
      `${base}/rest/v1/locations?select=account_id,name&id=eq.${args.locationId}`,
      { headers: svc },
    )
  ).json().catch(() => null)) as Array<{ account_id?: unknown; name?: unknown }> | null;
  const accountId = typeof locRows?.[0]?.account_id === "string" ? locRows[0].account_id : null;
  if (!accountId) return;
  const locationName = typeof locRows?.[0]?.name === "string" ? locRows[0].name : "";

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < args.guestPhones.length; i++) {
    const raw = args.guestPhones[i];
    const phone = typeof raw === "string" ? normalizePhone(raw) : null;
    if (!phone || !env.hashSecret) continue;
    const hash = phoneHash(phone, accountId, env.hashSecret);
    // Narrowed by name since 0032: a number can carry several profiles, and
    // `profRows[0]` would file this visit — treatment, price, therapist —
    // against whichever of them the database happened to return first.
    const rawName = args.guestCrmNames[i];
    const key = nameKey(typeof rawName === "string" ? rawName : null);
    const profRows = (await (
      await fetch(
        `${base}/rest/v1/guest_profiles?select=id&account_id=eq.${accountId}&phone_hash=eq.${hash}` +
          `&name_key=eq.${encodeURIComponent(key)}`,
        { headers: svc },
      )
    ).json().catch(() => null)) as Array<{ id?: unknown }> | null;
    // Exactly one, or none. Anything else means the narrowing failed and we
    // cannot say whose visit this is — dropping the history row is the
    // recoverable outcome; attributing a treatment to the wrong guest is not.
    const guestId =
      profRows?.length === 1 && typeof profRows[0]?.id === "string" ? profRows[0].id : null;
    if (!guestId) continue;

    const sel = asRecord(args.treatmentSelections[i]);
    const ther = asRecord(args.therapists[i]);
    const room = args.roomAssignments[i] ?? null;
    rows.push({
      account_id: accountId,
      location_id: args.locationId,
      location_name: locationName,
      guest_id: guestId,
      intake_id: args.intakeId,
      treatment_name: pickTreatmentName(sel),
      treatment_price: typeof sel?.price === "number" ? sel.price : null,
      duration_min: typeof sel?.minutes === "number" ? sel.minutes : null,
      therapist_id: typeof ther?.id === "string" ? ther.id : null,
      therapist_name: typeof ther?.name === "string" ? ther.name : null,
      room_name: room?.roomName ?? null,
      bed_name: room?.bedName ?? null,
    });
  }
  if (rows.length === 0) return;

  await fetch(`${base}/rest/v1/guest_visits`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  }).catch(() => {});
}

// TreatmentSnapshot carries nameI18n (all languages); fall back to a plain
// name field if a future shape simplifies. Polish first — it is the product's
// home locale and the dashboard default.
// Exported for api/_previsitCore.ts, the other writer of guest_visits rows:
// both must resolve a treatment name the same way or the CRM's visit history
// reads inconsistently depending on which path checked the guest in.
export function pickTreatmentName(sel: Record<string, unknown> | null): string | null {
  if (!sel) return null;
  const i18n = asRecord(sel.nameI18n);
  if (i18n) {
    for (const lang of ["pl", "en"]) {
      if (typeof i18n[lang] === "string" && i18n[lang]) return i18n[lang] as string;
    }
    for (const v of Object.values(i18n)) if (typeof v === "string" && v) return v;
  }
  return typeof sel.name === "string" ? sel.name : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// Whitelists one guest's room/bed snapshot: fixed shape, so unlike the
// free-form therapist/treatment entries this is worth validating field-by-
// field rather than just size-capping. A malformed or missing entry becomes
// null (no room assigned) rather than rejecting the whole intake.
function sanitizeRoomAssignment(v: unknown): {
  roomId: string;
  roomName: string;
  bedId: string | null;
  bedName: string | null;
} | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  const roomId = typeof obj.roomId === "string" ? obj.roomId : null;
  const roomName = typeof obj.roomName === "string" ? obj.roomName.trim().slice(0, MAX_NAME_CHARS) : null;
  if (!roomId || !roomName) return null;
  const bedId = typeof obj.bedId === "string" ? obj.bedId : null;
  const bedName = typeof obj.bedName === "string" ? obj.bedName.trim().slice(0, MAX_NAME_CHARS) : null;
  return { roomId, roomName, bedId, bedName: bedId ? bedName : null };
}
