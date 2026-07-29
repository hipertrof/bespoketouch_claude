import { supabase } from "./supabase";

// Client wrapper for the Guest 360 CRM endpoint (/api/crm — api/_crmCore.ts).
// All guest CRM tables are service-role-only, so every read/write goes through
// the endpoint with the caller's JWT; the server enforces manager-and-up in
// the named account. Mirrors src/lib/members.ts's bearer-call pattern.

export interface CrmGuestListItem {
  id: string;
  name: string | null;
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
