// Device pairing — kiosk-side client for the anonymous /api/device endpoint.
// The tablet stores an opaque token (a tokens.id UUID) in localStorage and
// re-validates it on every load to resolve its location (replacing the old
// ?location= query-param bridge). Mirrors the bt_lang storage pattern.

const TOKEN_KEY = "bt_device_token";

export function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setDeviceToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode / storage disabled — token just won't persist */
  }
}

export function clearDeviceToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function postDevice(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("/api/device", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg = typeof json?.error === "string" ? json.error : `Request failed (${res.status}).`;
    throw new Error(msg);
  }
  return json ?? {};
}

// Exchange a 6-digit code for a token, persist it, and return the resolved
// location. Throws with a message on an invalid/expired/used code.
export async function pairDevice(code: string): Promise<{ locationId: string }> {
  const json = await postDevice({ action: "pair", code });
  const token = json.token;
  const locationId = json.locationId;
  if (typeof token !== "string" || typeof locationId !== "string") {
    throw new Error("Pairing failed.");
  }
  setDeviceToken(token);
  return { locationId };
}

// Check the stored token is still live; returns the resolved location or null.
export async function validateDevice(token: string): Promise<{ locationId: string } | null> {
  const json = await postDevice({ action: "validate", token });
  if (json.valid === true && typeof json.locationId === "string") {
    return { locationId: json.locationId };
  }
  return null;
}

// Fire-and-forget liveness ping. Failures are swallowed (best-effort).
export async function heartbeatDevice(token: string): Promise<void> {
  try {
    await postDevice({ action: "heartbeat", token });
  } catch {
    /* ignore — heartbeat is best-effort */
  }
}
