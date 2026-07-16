import { supabase } from "./supabase";

// Manager pairing — authed client for /api/pairing (create slot + code,
// re-pair, revoke). Passes the caller's access token so the service-role
// backend can authorize. Mirrors members.ts.

export interface PairCodeResult {
  code: string;
  expiresAt: string;
}

async function postPairing(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const res = await fetch("/api/pairing", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // Surface the structured cap/rate-limit codes so the UI can localize them.
    const err = new Error((json.error as string) ?? `Request failed (${res.status})`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return json;
}

// Create a new kiosk slot at a location and get its first 6-digit pair code.
// Throws Error("slot_limit_reached") when the account is at its slots_paid cap.
export async function createSlot(locationId: string, label: string): Promise<PairCodeResult & { slotId: string }> {
  const json = await postPairing({ action: "createSlot", locationId, label });
  return {
    slotId: String(json.slotId),
    code: String(json.code),
    expiresAt: String(json.expiresAt),
  };
}

// Re-pair a slot (wiped browser / swapped tablet): revokes the old token, mints
// a fresh code. Throws Error("re_pair_too_soon") if within the cooldown.
export async function repairSlot(slotId: string): Promise<PairCodeResult> {
  const json = await postPairing({ action: "repair", slotId });
  return { code: String(json.code), expiresAt: String(json.expiresAt) };
}

// Retire a slot (frees it against the cap) and kill its tokens.
export async function revokeSlot(slotId: string): Promise<void> {
  await postPairing({ action: "revoke", slotId });
}
