import { supabase } from "./supabase";

// Soft payment-lapse reminders (Phase 5, pre-Stripe).
//
// The monetization split: pairing a NEW device is a HARD limit (enforced by
// /api/pairing against accounts.slots_paid), but a payment lapse is SOFT —
// paired kiosks keep running and a live guest check-in is never blocked. All
// this module does is tell a manager the subscription needs renewing.
//
// Nothing here gates anything. If it throws, callers swallow it: a billing
// reminder must never take a dashboard down.

/** How many days before subscription_end the reminder starts appearing. */
export const ENDING_SOON_DAYS = 14;

export type SubscriptionState = "ok" | "endingSoon" | "lapsed";

export interface SubscriptionStatus {
  state: SubscriptionState;
  /** Whole days until subscription_end. Negative once it has passed. */
  days: number;
  /** The account's subscription_end, as the stored "YYYY-MM-DD". */
  end: string;
}

export interface AccountSubscription {
  id: string;
  name: string;
  subscription_end: string | null;
  /** null when the account has no subscription_end set (nothing to remind about). */
  status: SubscriptionStatus | null;
}

const DAY_MS = 86_400_000;

// Both sides are collapsed to a UTC midnight so the subtraction counts calendar
// days, not elapsed hours — otherwise a manager in Europe/Warsaw flips a day
// early or late depending on the clock.
function startOfDayUtc(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDateUtc(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Classify an account's subscription_end against today.
 * Returns null when there is no end date — an account the platform admin never
 * put on a subscription must not be nagged.
 */
export function subscriptionStatus(end: string | null, now: Date = new Date()): SubscriptionStatus | null {
  if (!end) return null;
  const endMs = parseDateUtc(end);
  if (endMs === null) return null;

  const days = Math.round((endMs - startOfDayUtc(now)) / DAY_MS);
  const state: SubscriptionState = days < 0 ? "lapsed" : days <= ENDING_SOON_DAYS ? "endingSoon" : "ok";
  return { state, days, end };
}

/** The accounts where a membership can act on billing (owner/manager), deduped. */
export function billableAccountIds(memberships: { role: string; account_id: string }[]): string[] {
  const ids = memberships
    .filter((m) => m.role === "owner" || m.role === "manager")
    .map((m) => m.account_id);
  return [...new Set(ids)];
}

/**
 * Subscription state for the given accounts, readable under the accounts_read
 * RLS policy (has_account_access). Only accounts needing a reminder are worth
 * rendering, so callers filter on `status.state`.
 */
export async function fetchSubscriptions(accountIds: string[]): Promise<AccountSubscription[]> {
  if (accountIds.length === 0) return [];
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, subscription_end")
    .in("id", accountIds);
  if (error) throw error;

  return ((data as Omit<AccountSubscription, "status">[] | null) ?? []).map((a) => ({
    ...a,
    status: subscriptionStatus(a.subscription_end),
  }));
}

/** Renders a stored "YYYY-MM-DD" in the reader's language. */
export function formatEndDate(end: string, lang: string): string {
  const ms = parseDateUtc(end);
  if (ms === null) return end;
  return new Date(ms).toLocaleDateString(lang, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
