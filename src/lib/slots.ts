import { supabase } from "./supabase";

// Slot reads for the manager "Kiosks" dashboard, via client RLS (slots_read_auth
// + tokens_read_auth from 0011). tokens embeds through the FK tokens.slot_id →
// slots.id. Writes go through src/lib/pairing.ts (service-role endpoint).

export interface SlotToken {
  issued_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
}

export interface SlotRow {
  id: string;
  account_id: string;
  location_id: string;
  label: string | null;
  status: string;
  created_at: string;
  tokens: SlotToken[];
  // Derived: has a live (non-revoked) token, and its most recent last_seen_at.
  paired: boolean;
  lastSeen: string | null;
}

// Active slots for a location, newest first, each with its token liveness.
export async function listSlots(locationId: string): Promise<SlotRow[]> {
  const { data, error } = await supabase
    .from("slots")
    .select("id, account_id, location_id, label, status, created_at, tokens(issued_at, revoked_at, last_seen_at)")
    .eq("location_id", locationId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data as Omit<SlotRow, "paired" | "lastSeen">[] | null) ?? []).map((s) => {
    const live = (s.tokens ?? []).filter((t) => !t.revoked_at);
    const lastSeen = live
      .map((t) => t.last_seen_at)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;
    return { ...s, paired: live.length > 0, lastSeen };
  });
}

// Slots_paid for an account (readable under accounts_read RLS) — for the
// "X / N slots used" display and the client-side add-disabled hint.
export async function fetchSlotsPaid(accountId: string): Promise<number> {
  const { data, error } = await supabase
    .from("accounts")
    .select("slots_paid")
    .eq("id", accountId)
    .single();
  if (error) throw error;
  return Number((data as { slots_paid: number } | null)?.slots_paid ?? 0);
}
