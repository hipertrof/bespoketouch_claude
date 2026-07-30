import { supabase } from "./supabase";

// Client wrapper for the Guest 360 CRM endpoint (/api/crm — api/_crmCore.ts).
// All guest CRM tables are service-role-only, so every read/write goes through
// the endpoint with the caller's JWT; the server enforces manager-and-up in
// the named account. Mirrors src/lib/members.ts's bearer-call pattern.

export interface CrmGuestListItem {
  id: string;
  name: string | null;
  baseConsent: boolean;
  healthConsent: boolean;
  marketingConsent: boolean;
  visitCount: number;
  lastVisitAt: string | null;
  totalSpend: number;
  lastSeenAt: string | null;
  createdAt: string | null;
  tagIds: string[];
}

// Sorting and segmenting happen server-side over aggregates computed from the
// whole account, not over one page — see _crmCore.listGuests for why that has
// to be the endpoint's job rather than the client's.
export type CrmSort = "lastVisit" | "visits" | "spend" | "name" | "newest";
export type CrmSegment = "all" | "regulars" | "new" | "lapsed";
// ANDed together. "base" matches every profile (a row cannot exist without
// base consent), so it reads as "everyone in the CRM" rather than narrowing.
export type CrmConsent = "base" | "health" | "marketing";

export interface CrmFilters {
  search?: string;
  sort?: CrmSort;
  segment?: CrmSegment;
  consents?: CrmConsent[];
  tagId?: string;
}

export interface CrmGuestPage {
  guests: CrmGuestListItem[];
  // Matches after filtering, before pagination — what the UI counts.
  total: number;
  // The account holds more profiles than one scan returns, so `total` is a
  // floor rather than the truth. Surfaced so the UI can say so out loud.
  capped: boolean;
}

// A list-export row: everything the list shows, plus the marketing-tier
// contact columns. Those are null in the database unless the guest gave
// marketing consent, so an export can never carry a detail that was never
// granted — filter by the marketing consent to get a mailable list.
export interface CrmExportRow extends CrmGuestListItem {
  contactPhone: string | null;
  contactEmail: string | null;
  birthday: string | null;
}

export interface CrmVisit {
  id: string;
  location_name: string;
  visited_at: string;
  treatment_name: string | null;
  treatment_price: number | null;
  duration_min: number | null;
  therapist_name: string | null;
  room_name: string | null;
  bed_name: string | null;
}

export interface CrmNote {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface CrmTag {
  id: string;
  name: string;
  color: string | null;
}

export interface CrmSurvey {
  id: string;
  therapist_name: string | null;
  treatment_type: string | null;
  csat_stars: number | null;
  nps: number | null;
  next_visit_note: string | null;
  created_at: string;
}

export interface CrmConsentStamp {
  version: string | null;
  at: string | null;
}

export interface CrmGuestDetail {
  guest: {
    id: string;
    name: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    birthday: string | null;
    preferences: unknown;
    consent: {
      base: CrmConsentStamp;
      health: CrmConsentStamp;
      marketing: CrmConsentStamp;
    };
    createdAt: string | null;
    lastSeenAt: string | null;
  };
  visits: CrmVisit[];
  notes: CrmNote[];
  tags: CrmTag[];
  surveys: CrmSurvey[];
  stats: {
    visitCount: number;
    firstVisitAt: string | null;
    lastVisitAt: string | null;
    totalSpend: number;
    favoriteTherapist: string | null;
    favoriteTreatment: string | null;
  };
}

async function postCrm<T>(payload: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");
  const res = await fetch("/api/crm", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg = typeof json?.error === "string" ? json.error : `Request failed (${res.status}).`;
    throw new Error(msg);
  }
  return json as T;
}

export async function listCrmGuests(
  accountId: string,
  opts: CrmFilters & { limit?: number; offset?: number } = {},
): Promise<CrmGuestPage> {
  const json = await postCrm<{ guests?: CrmGuestListItem[]; total?: number; capped?: boolean }>({
    action: "list",
    accountId,
    search: opts.search,
    sort: opts.sort,
    segment: opts.segment,
    consents: opts.consents,
    tagId: opts.tagId,
    limit: opts.limit,
    offset: opts.offset,
  });
  return {
    guests: json.guests ?? [],
    total: json.total ?? 0,
    capped: json.capped === true,
  };
}

// Every guest matching the CURRENT filters, unpaginated, for a CSV download.
// Shares the endpoint's one filter pipeline with `list`, so what downloads is
// exactly what was on screen.
export async function exportCrmGuestList(
  accountId: string,
  filters: CrmFilters = {},
): Promise<CrmExportRow[]> {
  const json = await postCrm<{ guests?: CrmExportRow[] }>({
    action: "exportList",
    accountId,
    search: filters.search,
    sort: filters.sort,
    segment: filters.segment,
    consents: filters.consents,
    tagId: filters.tagId,
  });
  return json.guests ?? [];
}

export async function getCrmGuest(accountId: string, guestId: string): Promise<CrmGuestDetail> {
  return postCrm<CrmGuestDetail>({ action: "get", accountId, guestId });
}

export async function addCrmNote(accountId: string, guestId: string, body: string): Promise<void> {
  await postCrm({ action: "addNote", accountId, guestId, body });
}

export async function deleteCrmNote(accountId: string, noteId: string): Promise<void> {
  await postCrm({ action: "deleteNote", accountId, noteId });
}

export async function listCrmTags(accountId: string): Promise<CrmTag[]> {
  const json = await postCrm<{ tags: CrmTag[] }>({ action: "listTags", accountId });
  return json.tags ?? [];
}

export async function createCrmTag(accountId: string, name: string, color?: string): Promise<CrmTag | null> {
  const json = await postCrm<{ tag: CrmTag | null }>({ action: "createTag", accountId, name, color });
  return json.tag ?? null;
}

export async function deleteCrmTag(accountId: string, tagId: string): Promise<void> {
  await postCrm({ action: "deleteTag", accountId, tagId });
}

export async function assignCrmTag(accountId: string, guestId: string, tagId: string): Promise<void> {
  await postCrm({ action: "assignTag", accountId, guestId, tagId });
}

export async function unassignCrmTag(accountId: string, guestId: string, tagId: string): Promise<void> {
  await postCrm({ action: "unassignTag", accountId, guestId, tagId });
}

// GDPR Art. 17 — erases the profile; visits/notes/tags cascade away, survey
// links go null.
export async function forgetCrmGuest(accountId: string, guestId: string): Promise<void> {
  await postCrm({ action: "forget", accountId, guestId });
}

// GDPR Art. 15/20 — everything held about the guest, as one JSON blob.
export async function exportCrmGuest(accountId: string, guestId: string): Promise<unknown> {
  return postCrm({ action: "export", accountId, guestId });
}

// ---------------------------------------------------------------------------
// Consent desk — receptionist-and-up. A narrower door than everything above:
// find a guest by the phone they're calling from, see only their three
// consent tiers, and withdraw one. No name history, visits, notes, or spend
// reach this path — see api/_crmCore.ts's authorizeStaff for the boundary.
// ---------------------------------------------------------------------------

export interface CrmConsentLookup {
  found: boolean;
  guestId?: string;
  name?: string | null;
  consent?: {
    base: CrmConsentStamp;
    health: CrmConsentStamp;
    marketing: CrmConsentStamp;
  };
}

export async function lookupCrmConsentByPhone(accountId: string, phone: string): Promise<CrmConsentLookup> {
  return postCrm<CrmConsentLookup>({ action: "lookupConsentByPhone", accountId, phone });
}

// Withdrawal only — there is no matching "grant" call. Granting a tier
// requires the guest having seen the disclosure copy, which only the kiosk
// and /checkin show; this desk has no such moment, so it can only turn tiers
// off. `base: true` erases the whole profile, same as `forgetCrmGuest`.
export async function withdrawCrmConsent(
  accountId: string,
  guestId: string,
  tiers: { base?: boolean; health?: boolean; marketing?: boolean },
): Promise<{ ok: boolean; erased: boolean }> {
  const json = await postCrm<{ ok?: boolean; erased?: boolean }>({
    action: "withdrawConsent",
    accountId,
    guestId,
    withdrawBase: tiers.base,
    withdrawHealth: tiers.health,
    withdrawMarketing: tiers.marketing,
  });
  return { ok: json.ok === true, erased: json.erased === true };
}

// ---------------------------------------------------------------------------
// Refused erasure request (Art. 17(3))
// ---------------------------------------------------------------------------

// The legal ground the spa is relying on. Closed set — the server maps each to
// a fixed sentence in erasure_log.retained_under_exemption, so the free-text
// reason carries the specifics and never the law.
export type CrmRefusalGround = "legal_obligation" | "legal_claims" | "contract" | "other";

// Changes NO guest data — it writes one erasure_log row and nothing else.
// Unlike every other call here, `logged` is therefore the whole result rather
// than a receipt on something already done: logged === false means the refusal
// was NOT recorded and the staffer has to note it elsewhere.
export async function recordCrmRefusal(
  accountId: string,
  guestId: string,
  opts: { ground: CrmRefusalGround; reason: string; channel: "dashboard" | "consent_desk" },
): Promise<{ ok: boolean; logged: boolean }> {
  const json = await postCrm<{ ok?: boolean; logged?: boolean }>({
    action: "recordRefusal",
    accountId,
    guestId,
    refusalGround: opts.ground,
    refusalReason: opts.reason,
    channel: opts.channel,
  });
  return { ok: json.ok === true, logged: json.logged === true };
}

// ---------------------------------------------------------------------------
// Erasure register — the spa's own Art. 5(2) record, manager-and-up
// ---------------------------------------------------------------------------
// Stays pseudonymous: `reference` is a truncated phone_hash, never a name or a
// number. To find one person's record you SEARCH their phone — the hashing
// happens on the server and the raw number never reaches the database.

export interface CrmErasureEntry {
  reference: string;
  receivedAt: string | null;
  channel: string | null;
  identityVerification: string | null;
  scope: string[];
  outcome: string | null;
  refusalReason: string | null;
  retainedUnderExemption: string | null;
  completedAt: string | null;
  executedBy: string | null;
  executedBySystem: string | null;
  recipientsNotified: string[] | null;
}

export interface CrmErasureFilters {
  from?: string;
  to?: string;
  outcome?: string;
  phone?: string;
}

export async function listCrmErasures(
  accountId: string,
  filters: CrmErasureFilters,
  limit: number,
  offset: number,
): Promise<{ entries: CrmErasureEntry[]; total: number; capped: boolean }> {
  const json = await postCrm<{ entries?: CrmErasureEntry[]; total?: number; capped?: boolean }>({
    action: "listErasures",
    accountId,
    ...filters,
    limit,
    offset,
  });
  return { entries: json.entries ?? [], total: json.total ?? 0, capped: json.capped === true };
}

// Same filters, same pipeline, no pagination — what the regulator gets is
// exactly the register on screen.
export async function exportCrmErasures(
  accountId: string,
  filters: CrmErasureFilters,
): Promise<{ entries: CrmErasureEntry[]; capped: boolean }> {
  const json = await postCrm<{ entries?: CrmErasureEntry[]; capped?: boolean }>({
    action: "exportErasures",
    accountId,
    ...filters,
  });
  return { entries: json.entries ?? [], capped: json.capped === true };
}
