// Device-token authentication shared by the anonymous kiosk endpoints
// (_deviceCore, _intakeCore, _guestCore). Underscore-prefixed so Vercel bundles
// it without routing it.
//
// This is the SINGLE definition of "what makes a device token valid" — the rule
// the whole kiosk write path rests on. Phase 2 hardening moved the kiosk off the
// anon RLS bridge: instead of the client telling the server which location it is
// writing to (a `?location=<uuid>` anyone could copy), the tablet presents its
// opaque token and the server DERIVES the location from it. A caller can only
// ever act on the location its own slot is paired to.
//
// A token is valid iff it exists, was never revoked, and its slot is still
// active. Revoking a slot or re-pairing it therefore cuts the old tablet off
// from writing, immediately and everywhere.

export interface DeviceAuthEnv {
  url: string;
  serviceKey: string;
}

export interface DeviceIdentity {
  tokenId: string;
  slotId: string;
  locationId: string;
}

type Headers = Record<string, string>;

// A token is a UUID (tokens.id). Guard the shape so a junk value can't build a
// malformed REST filter.
export function normalizeToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return /^[0-9a-f-]{36}$/i.test(t) ? t : null;
}

export function svcHeaders(env: DeviceAuthEnv): Headers {
  return { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` };
}

// Resolve a raw token from a kiosk into the identity it proves. Returns null for
// any token that is malformed, unknown, revoked, or whose slot is no longer
// active — callers MUST treat null as 401 and must never fall back to a
// client-supplied location.
export async function resolveDevice(
  rawToken: unknown,
  env: DeviceAuthEnv,
): Promise<DeviceIdentity | null> {
  const token = normalizeToken(rawToken);
  if (!token) return null;

  const base = env.url.replace(/\/$/, "");
  const res = await fetch(
    `${base}/rest/v1/tokens?select=id,revoked_at,slot:slots(id,location_id,status)&id=eq.${token}`,
    { headers: svcHeaders(env) },
  );
  const body = await res.json().catch(() => null);
  const row = Array.isArray(body) ? (body[0] as Record<string, unknown> | undefined) : undefined;
  if (!row || row.revoked_at) return null;

  const slot =
    row.slot && typeof row.slot === "object" && !Array.isArray(row.slot)
      ? (row.slot as Record<string, unknown>)
      : null;
  if (!slot || slot.status !== "active") return null;
  if (typeof slot.location_id !== "string") return null;

  return { tokenId: token, slotId: String(slot.id), locationId: slot.location_id };
}

// Best-effort liveness stamp. Every authenticated kiosk write doubles as a sign
// of life, so the dashboard's "last seen" stays fresh between heartbeats.
export function touchLastSeen(env: DeviceAuthEnv, tokenId: string): void {
  const base = env.url.replace(/\/$/, "");
  void fetch(`${base}/rest/v1/tokens?id=eq.${tokenId}`, {
    method: "PATCH",
    headers: { ...svcHeaders(env), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  }).catch(() => {});
}

// Guards against a PUBLIC key being pasted where the secret service_role key
// belongs. Shared by every service-role kiosk endpoint.
export function checkDeviceConfig(env: DeviceAuthEnv): { status: number; json: unknown } | null {
  if (!env.url || !env.serviceKey) {
    return {
      status: 500,
      json: { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY is missing." },
    };
  }
  const keyRole = jwtRole(env.serviceKey);
  const isPublicKey =
    env.serviceKey.startsWith("sb_publishable_") || (keyRole !== null && keyRole !== "service_role");
  if (isPublicKey) {
    return {
      status: 500,
      json: {
        error:
          "SUPABASE_SERVICE_ROLE_KEY looks like a public key, not the secret service_role key. " +
          "Copy the service_role / secret key from Supabase → Project Settings → API into the env.",
      },
    };
  }
  return null;
}

// Reads the `role` claim from a Supabase legacy key (a JWT). Returns null for
// non-JWT keys (the new sb_secret_… format), which pass.
function jwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}
