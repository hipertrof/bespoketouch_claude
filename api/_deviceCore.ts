// Shared logic for the anonymous device-pairing endpoint, used by both the
// Vercel serverless function (api/device.ts) and the dev Vite middleware
// (vite-plugins/device-proxy.ts).
//
// Dependency-free plain fetch against Supabase REST, mirroring api/_guestCore.ts
// and _membersCore.ts (the SDK crashed the serverless function). Underscore-
// prefixed so Vercel bundles it without routing it.
//
// Runs with the SERVICE ROLE key. Callers are ANONYMOUS tablets (no JWT): a
// kiosk pairs with a 6-digit code, then stores the returned opaque token and
// re-validates it on every load. Codes + tokens never cross an RLS client — all
// three actions run service-side here.
//
// Token validation itself lives in _deviceAuth.ts, shared with the kiosk write
// endpoints (_intakeCore, _guestCore) so "valid token" has one definition.

import {
  checkDeviceConfig,
  resolveDevice,
  svcHeaders,
  touchLastSeen,
  type DeviceAuthEnv,
} from "./_deviceAuth.js";

export type DeviceEnv = DeviceAuthEnv;

export interface DeviceResult {
  status: number;
  json: unknown;
}

interface DeviceBody {
  action?: string;
  code?: string;
  token?: string;
}

type Headers = Record<string, string>;
type JsonRecord = Record<string, unknown>;

export async function handleDevice(
  body: DeviceBody | undefined,
  env: DeviceEnv,
): Promise<DeviceResult> {
  const configError = checkDeviceConfig(env);
  if (configError) return configError;

  switch (body?.action) {
    case "pair":
      return pairDevice(body, env);
    case "validate":
      return validateDevice(body, env);
    case "heartbeat":
      return heartbeatDevice(body, env);
    default:
      return { status: 400, json: { error: "Unknown or missing action." } };
  }
}

// Exchange a 6-digit code for a token bound to the code's slot. The code must
// exist, be unexpired, unused, and belong to an active slot.
async function pairDevice(body: DeviceBody, env: DeviceEnv): Promise<DeviceResult> {
  const code = normalizeCode(body.code);
  if (!code) return { status: 400, json: { error: "Invalid code." } };

  const base = env.url.replace(/\/$/, "");
  const svc = svcHeaders(env);

  const codeRow = asArray(
    (
      await getJson(
        `${base}/rest/v1/pair_codes?select=code,slot_id,expires_at,used_at&code=eq.${encodeURIComponent(code)}`,
        svc,
      )
    ).body,
  )[0];
  if (!codeRow) return { status: 404, json: { error: "Code not found." } };
  if (codeRow.used_at) return { status: 409, json: { error: "Code already used." } };
  if (isPast(codeRow.expires_at)) return { status: 410, json: { error: "Code expired." } };

  const slotId = String(codeRow.slot_id);
  const slot = asArray(
    (await getJson(`${base}/rest/v1/slots?select=id,location_id,status&id=eq.${slotId}`, svc)).body,
  )[0];
  if (!slot || slot.status !== "active") {
    return { status: 409, json: { error: "This kiosk slot is no longer active." } };
  }

  // Mint a token. Its id is the opaque device token stored on the tablet.
  const now = new Date().toISOString();
  const tokenRow = asArray(
    (
      await postJson(`${base}/rest/v1/tokens`, { ...svc, Prefer: "return=representation" }, {
        slot_id: slotId,
        issued_at: now,
        last_seen_at: now,
      })
    ).body,
  )[0];
  const tokenId = tokenRow?.id;
  if (typeof tokenId !== "string") {
    return { status: 500, json: { error: "Could not issue a device token." } };
  }

  // Consume the code (single-use).
  await fetch(`${base}/rest/v1/pair_codes?code=eq.${encodeURIComponent(code)}`, {
    method: "PATCH",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ used_at: now }),
  });

  return { status: 200, json: { token: tokenId, locationId: slot.location_id } };
}

// Check a stored token is still live (not revoked, slot still active). Touches
// last_seen_at on success. Returns the location so the kiosk can boot.
async function validateDevice(body: DeviceBody, env: DeviceEnv): Promise<DeviceResult> {
  const device = await resolveDevice(body.token, env);
  if (!device) return { status: 200, json: { valid: false } };
  touchLastSeen(env, device.tokenId);
  return { status: 200, json: { valid: true, locationId: device.locationId } };
}

// Periodic liveness ping from a paired kiosk. Validates first, so a revoked
// token can't keep a dead slot looking alive on the dashboard.
async function heartbeatDevice(body: DeviceBody, env: DeviceEnv): Promise<DeviceResult> {
  const device = await resolveDevice(body.token, env);
  if (!device) return { status: 401, json: { error: "This device is not paired." } };
  touchLastSeen(env, device.tokenId);
  return { status: 200, json: { ok: true } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Exactly six digits. Whitespace/formatting stripped.
function normalizeCode(raw: string | undefined): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

function isPast(ts: unknown): boolean {
  if (typeof ts !== "string") return true;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) || ms < Date.now();
}

function asArray(v: unknown): JsonRecord[] {
  return Array.isArray(v) ? (v as JsonRecord[]) : [];
}

async function getJson(url: string, headers: Headers): Promise<{ ok: boolean; status: number; body: unknown }> {
  const r = await fetch(url, { headers });
  const body = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body };
}

async function postJson(
  url: string,
  headers: Headers,
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const r = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body };
}
