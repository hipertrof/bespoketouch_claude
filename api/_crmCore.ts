// Shared logic for the Guest 360 CRM endpoint, used by both the Vercel
// serverless function (api/crm.ts) and the dev Vite middleware
// (vite-plugins/crm-proxy.ts).
//
// Dependency-free plain fetch against Supabase REST, mirroring
// api/_membersCore.ts (the SDK crashed serverless functions). Underscore-
// prefixed so Vercel bundles it without routing it.
//
// Runs with the SERVICE ROLE key: guest_profiles / guest_visits / guest_notes /
// guest_tags / guest_tag_assignments are RLS-deny-all with no policies, so this
// endpoint is the ONLY way staff reach guest CRM data — and it must authorize
// the caller itself. The gate is MANAGER-AND-UP (owner/manager membership in
// the account, or platform admin), matching the survey_responses manager-only
// precedent from 0013: raw contact data and visit history never reach a
// therapist or front-desk login, nor any browser-side Supabase query.
//
// Every action takes { accountId } and verifies the caller's membership in
// THAT account before touching anything — the client names the account, the
// server decides whether that's allowed.

interface CrmEnv {
  url: string;
  serviceKey: string;
}

export interface CrmResult {
  status: number;
  json: unknown;
}

interface CrmBody {
  action?: string;
  accountId?: string;
  guestId?: string;
  noteId?: string;
  tagId?: string;
  body?: unknown;
  name?: unknown;
  color?: unknown;
  search?: unknown;
  limit?: unknown;
  offset?: unknown;
}

type Headers = Record<string, string>;
type JsonRecord = Record<string, unknown>;

const MAX_NOTE_CHARS = 2000;
const MAX_TAG_CHARS = 40;
const DEFAULT_PAGE = 50;

export async function handleCrm(
  authorization: string | undefined,
  body: CrmBody | undefined,
  env: CrmEnv,
): Promise<CrmResult> {
  if (!env.url || !env.serviceKey) {
    return { status: 500, json: { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY is missing." } };
  }
  const base = env.url.replace(/\/$/, "");
  const svc: Headers = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` };

  const auth = await authorizeManager(authorization, body?.accountId, base, svc, env);
  if (!auth.ok) return auth.result;
  const { accountId, callerId, callerName } = auth;

  switch (body?.action) {
    case "list":
      return listGuests(body, accountId, base, svc);
    case "get":
      return getGuest(body, accountId, base, svc);
    case "addNote":
      return addNote(body, accountId, callerId, callerName, base, svc);
    case "deleteNote":
      return deleteNote(body, accountId, base, svc);
    case "createTag":
      return createTag(body, accountId, base, svc);
    case "renameTag":
      return renameTag(body, accountId, base, svc);
    case "deleteTag":
      return deleteTag(body, accountId, base, svc);
    case "assignTag":
      return assignTag(body, accountId, base, svc);
    case "unassignTag":
      return unassignTag(body, accountId, base, svc);
    case "listTags":
      return listTags(accountId, base, svc);
    case "forget":
      return forgetGuestById(body, accountId, base, svc);
    case "export":
      return exportGuest(body, accountId, base, svc);
    default:
      return { status: 400, json: { error: "Unknown or missing action." } };
  }
}

// ---------------------------------------------------------------------------
// Authorization — manager-and-up in the named account.
// ---------------------------------------------------------------------------

type ManagerAuth =
  | { ok: true; accountId: string; callerId: string; callerName: string }
  | { ok: false; result: CrmResult };

async function authorizeManager(
  authorization: string | undefined,
  accountIdRaw: string | undefined,
  base: string,
  svc: Headers,
  env: CrmEnv,
): Promise<ManagerAuth> {
  const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, result: { status: 401, json: { error: "Missing authorization." } } };

  const accountId = typeof accountIdRaw === "string" && /^[0-9a-f-]{36}$/i.test(accountIdRaw) ? accountIdRaw : null;
  if (!accountId) return { ok: false, result: { status: 400, json: { error: "Missing accountId." } } };

  const caller = await getJson(`${base}/auth/v1/user`, {
    apikey: env.serviceKey,
    Authorization: `Bearer ${token}`,
  });
  const callerId = asRecord(caller.body)?.id;
  if (!caller.ok || typeof callerId !== "string") {
    return { ok: false, result: { status: 401, json: { error: "Invalid or expired session." } } };
  }

  const profRows = asArray(
    (await getJson(`${base}/rest/v1/profiles?select=is_platform_admin,full_name,email&user_id=eq.${callerId}`, svc)).body,
  );
  const prof = profRows[0];
  const callerName =
    (typeof prof?.full_name === "string" && prof.full_name) ||
    (typeof prof?.email === "string" && prof.email) ||
    "Staff";
  if (prof?.is_platform_admin) return { ok: true, accountId, callerId, callerName };

  const mgr = await getJson(
    `${base}/rest/v1/memberships?select=id&user_id=eq.${callerId}` +
      `&account_id=eq.${accountId}&role=in.(owner,manager)`,
    svc,
  );
  if (asArray(mgr.body).length === 0) {
    return { ok: false, result: { status: 403, json: { error: "Not authorized for this account's guests." } } };
  }
  return { ok: true, accountId, callerId, callerName };
}

// Every per-guest action re-checks the guest belongs to the authorized account
// — the guestId alone must never cross tenants.
async function guestInAccount(
  guestId: string | undefined,
  accountId: string,
  base: string,
  svc: Headers,
): Promise<JsonRecord | null> {
  if (typeof guestId !== "string" || !/^[0-9a-f-]{36}$/i.test(guestId)) return null;
  const rows = asArray(
    (await getJson(`${base}/rest/v1/guest_profiles?select=*&id=eq.${guestId}&account_id=eq.${accountId}`, svc)).body,
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// list / get
// ---------------------------------------------------------------------------

async function listGuests(body: CrmBody, accountId: string, base: string, svc: Headers): Promise<CrmResult> {
  const limit = Math.min(Math.max(intOr(body.limit, DEFAULT_PAGE), 1), 200);
  const offset = Math.max(intOr(body.offset, 0), 0);

  let url =
    `${base}/rest/v1/guest_profiles?select=id,display_name,consent_version,health_consent_version,` +
    `identity_consent_version,marketing_consent_version,created_at,last_seen_at,` +
    `guest_visits(id,visited_at),guest_tag_assignments(tag_id)` +
    `&account_id=eq.${accountId}&order=last_seen_at.desc.nullslast&limit=${limit}&offset=${offset}`;
  // Name search only means anything over identity-consented rows — anonymous
  // rows have no name to match.
  const search = typeof body.search === "string" ? body.search.trim().slice(0, 80) : "";
  if (search) url += `&display_name=ilike.${encodeURIComponent(`*${search}*`)}`;

  const res = await getJson(url, svc);
  if (!res.ok) return { status: 502, json: { error: `Could not load guests (${res.status}).` } };

  const guests = asArray(res.body).map((r) => {
    const visits = asArray(r.guest_visits);
    const visitDates = visits
      .map((v) => (typeof v.visited_at === "string" ? v.visited_at : null))
      .filter((d): d is string => d !== null)
      .sort();
    return {
      id: r.id,
      name: typeof r.display_name === "string" ? r.display_name : null,
      identityConsent: typeof r.identity_consent_version === "string",
      healthConsent: typeof r.health_consent_version === "string",
      marketingConsent: typeof r.marketing_consent_version === "string",
      visitCount: visits.length,
      lastVisitAt: visitDates[visitDates.length - 1] ?? null,
      lastSeenAt: r.last_seen_at ?? null,
      createdAt: r.created_at ?? null,
      tagIds: asArray(r.guest_tag_assignments).map((t) => t.tag_id),
    };
  });
  return { status: 200, json: { guests } };
}

async function getGuest(body: CrmBody, accountId: string, base: string, svc: Headers): Promise<CrmResult> {
  const row = await guestInAccount(body.guestId, accountId, base, svc);
  if (!row) return { status: 404, json: { error: "Guest not found." } };
  const guestId = String(row.id);

  const [visitsRes, notesRes, tagsRes, surveysRes] = await Promise.all([
    getJson(`${base}/rest/v1/guest_visits?select=*&guest_id=eq.${guestId}&order=visited_at.desc&limit=200`, svc),
    getJson(`${base}/rest/v1/guest_notes?select=id,author_name,body,created_at&guest_id=eq.${guestId}&order=created_at.desc&limit=200`, svc),
    getJson(`${base}/rest/v1/guest_tag_assignments?select=tag_id,guest_tags(id,name,color)&guest_id=eq.${guestId}`, svc),
    getJson(
      `${base}/rest/v1/survey_responses?select=id,therapist_name,treatment_type,csat_stars,nps,next_visit_note,created_at&guest_id=eq.${guestId}&order=created_at.desc&limit=100`,
      svc,
    ),
  ]);

  const visits = asArray(visitsRes.body);
  const healthConsent = typeof row.health_consent_version === "string";
  const identityConsent = typeof row.identity_consent_version === "string";

  // Same defense-in-depth strip as lookupGuest: no health stamp, no zones/notes.
  let preferences = row.preferences ?? null;
  if (!healthConsent && preferences && typeof preferences === "object") {
    const { zones: _z, zoneNotes: _zn, generalNote: _gn, ...rest } = preferences as JsonRecord;
    preferences = rest;
  }

  // Aggregates computed here, not in SQL — 200 visits is nothing, and it keeps
  // the endpoint free of DB functions.
  const spendValues = visits.map((v) => (typeof v.treatment_price === "number" ? v.treatment_price : 0));
  const totalSpend = spendValues.reduce((a, b) => a + b, 0);
  const favorite = (key: string) => {
    const counts = new Map<string, number>();
    for (const v of visits) {
      const val = v[key];
      if (typeof val === "string" && val) counts.set(val, (counts.get(val) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = 0;
    for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
    return best;
  };

  return {
    status: 200,
    json: {
      guest: {
        id: guestId,
        name: identityConsent && typeof row.display_name === "string" ? row.display_name : null,
        contactPhone: identityConsent && typeof row.contact_phone === "string" ? row.contact_phone : null,
        contactEmail: identityConsent && typeof row.contact_email === "string" ? row.contact_email : null,
        birthday: identityConsent && typeof row.birthday === "string" ? row.birthday : null,
        preferences,
        consent: {
          base: { version: row.consent_version ?? null, at: row.consent_at ?? null },
          health: { version: row.health_consent_version ?? null, at: row.health_consent_at ?? null },
          identity: { version: row.identity_consent_version ?? null, at: row.identity_consent_at ?? null },
          marketing: { version: row.marketing_consent_version ?? null, at: row.marketing_consent_at ?? null },
        },
        createdAt: row.created_at ?? null,
        lastSeenAt: row.last_seen_at ?? null,
      },
      visits,
      notes: asArray(notesRes.body),
      tags: asArray(tagsRes.body).map((t) => asRecord(t.guest_tags)).filter((t) => t !== null),
      surveys: asArray(surveysRes.body),
      stats: {
        visitCount: visits.length,
        firstVisitAt: visits.length ? visits[visits.length - 1].visited_at : null,
        lastVisitAt: visits.length ? visits[0].visited_at : null,
        totalSpend,
        favoriteTherapist: favorite("therapist_name"),
        favoriteTreatment: favorite("treatment_name"),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

async function addNote(
  body: CrmBody,
  accountId: string,
  callerId: string,
  callerName: string,
  base: string,
  svc: Headers,
): Promise<CrmResult> {
  const guest = await guestInAccount(body.guestId, accountId, base, svc);
  if (!guest) return { status: 404, json: { error: "Guest not found." } };
  const text = typeof body.body === "string" ? body.body.trim().slice(0, MAX_NOTE_CHARS) : "";
  if (!text) return { status: 400, json: { error: "Note text is required." } };

  const res = await fetch(`${base}/rest/v1/guest_notes`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      account_id: accountId,
      guest_id: String(guest.id),
      author_id: callerId,
      author_name: callerName,
      body: text,
    }),
  });
  if (!res.ok) return { status: 502, json: { error: `Could not add the note (${res.status}).` } };
  const rows = asArray(await res.json().catch(() => null));
  return { status: 200, json: { ok: true, note: rows[0] ?? null } };
}

async function deleteNote(body: CrmBody, accountId: string, base: string, svc: Headers): Promise<CrmResult> {
  if (typeof body.noteId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.noteId)) {
    return { status: 400, json: { error: "Missing note id." } };
  }
  const del = await fetch(
    `${base}/rest/v1/guest_notes?id=eq.${body.noteId}&account_id=eq.${accountId}`,
    { method: "DELETE", headers: { ...svc, Prefer: "return=representation" } },
  );
  if (!del.ok) return { status: 502, json: { error: `Could not delete the note (${del.status}).` } };
  if (asArray(await del.json().catch(() => null)).length === 0) {
    return { status: 404, json: { error: "Note not found." } };
  }
  return { status: 200, json: { ok: true } };
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

async function listTags(accountId: string, base: string, svc: Headers): Promise<CrmResult> {
  const res = await getJson(
    `${base}/rest/v1/guest_tags?select=id,name,color&account_id=eq.${accountId}&order=name.asc`,
    svc,
  );
  if (!res.ok) return { status: 502, json: { error: `Could not load tags (${res.status}).` } };
  return { status: 200, json: { tags: asArray(res.body) } };
}

async function createTag(body: CrmBody, accountId: string, base: string, svc: Headers): Promise<CrmResult> {
  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_TAG_CHARS) : "";
  if (!name) return { status: 400, json: { error: "Tag name is required." } };
  const color = typeof body.color === "string" ? body.color.trim().slice(0, 20) : null;

  const res = await fetch(`${base}/rest/v1/guest_tags`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ account_id: accountId, name, color }),
  });
  if (res.status === 409) return { status: 409, json: { error: "A tag with this name already exists." } };
  if (!res.ok) return { status: 502, json: { error: `Could not create the tag (${res.status}).` } };
  const rows = asArray(await res.json().catch(() => null));
  return { status: 200, json: { ok: true, tag: rows[0] ?? null } };
}

async function renameTag(body: CrmBody, accountId: string, base: string, svc: Headers): Promise<CrmResult> {
  if (typeof body.tagId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.tagId)) {
    return { status: 400, json: { error: "Missing tag id." } };
  }
  const patch: JsonRecord = {};
  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_TAG_CHARS) : "";
  if (name) patch.name = name;
  if (typeof body.color === "string") patch.color = body.color.trim().slice(0, 20) || null;
  if (Object.keys(patch).length === 0) return { status: 400, json: { error: "Nothing to update." } };

  const res = await fetch(`${base}/rest/v1/guest_tags?id=eq.${body.tagId}&account_id=eq.${accountId}`, {
    method: "PATCH",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (res.status === 409) return { status: 409, json: { error: "A tag with this name already exists." } };
  if (!res.ok) return { status: 502, json: { error: `Could not update the tag (${res.status}).` } };
  if (asArray(await res.json().catch(() => null)).length === 0) {
    return { status: 404, json: { error: "Tag not found." } };
  }
  return { status: 200, json: { ok: true } };
}

async function deleteTag(body: CrmBody, accountId: string, base: string, svc: Headers): Promise<CrmResult> {
  if (typeof body.tagId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.tagId)) {
    return { status: 400, json: { error: "Missing tag id." } };
  }
  const del = await fetch(`${base}/rest/v1/guest_tags?id=eq.${body.tagId}&account_id=eq.${accountId}`, {
    method: "DELETE",
    headers: { ...svc, Prefer: "return=representation" },
  });
  if (!del.ok) return { status: 502, json: { error: `Could not delete the tag (${del.status}).` } };
  if (asArray(await del.json().catch(() => null)).length === 0) {
    return { status: 404, json: { error: "Tag not found." } };
  }
  return { status: 200, json: { ok: true } };
}

async function assignTag(body: CrmBody, accountId: string, base: string, svc: Headers): Promise<CrmResult> {
  const guest = await guestInAccount(body.guestId, accountId, base, svc);
  if (!guest) return { status: 404, json: { error: "Guest not found." } };
  if (typeof body.tagId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.tagId)) {
    return { status: 400, json: { error: "Missing tag id." } };
  }
  // The tag must be this account's — otherwise a manager could attach another
  // tenant's tag ids to their guests (harmless-looking, but a cross-tenant ref).
  const tagRows = asArray(
    (await getJson(`${base}/rest/v1/guest_tags?select=id&id=eq.${body.tagId}&account_id=eq.${accountId}`, svc)).body,
  );
  if (tagRows.length === 0) return { status: 404, json: { error: "Tag not found." } };

  const res = await fetch(`${base}/rest/v1/guest_tag_assignments`, {
    method: "POST",
    headers: {
      ...svc,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({ guest_id: String(guest.id), tag_id: body.tagId }),
  });
  if (!res.ok) return { status: 502, json: { error: `Could not assign the tag (${res.status}).` } };
  return { status: 200, json: { ok: true } };
}

async function unassignTag(body: CrmBody, accountId: string, base: string, svc: Headers): Promise<CrmResult> {
  const guest = await guestInAccount(body.guestId, accountId, base, svc);
  if (!guest) return { status: 404, json: { error: "Guest not found." } };
  if (typeof body.tagId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.tagId)) {
    return { status: 400, json: { error: "Missing tag id." } };
  }
  const del = await fetch(
    `${base}/rest/v1/guest_tag_assignments?guest_id=eq.${String(guest.id)}&tag_id=eq.${body.tagId}`,
    { method: "DELETE", headers: { ...svc, Prefer: "return=minimal" } },
  );
  if (!del.ok) return { status: 502, json: { error: `Could not remove the tag (${del.status}).` } };
  return { status: 200, json: { ok: true } };
}

// ---------------------------------------------------------------------------
// forget / export — GDPR Art. 17 / 15+20 for manager-received requests.
// ---------------------------------------------------------------------------

async function forgetGuestById(body: CrmBody, accountId: string, base: string, svc: Headers): Promise<CrmResult> {
  const guest = await guestInAccount(body.guestId, accountId, base, svc);
  if (!guest) return { status: 404, json: { error: "Guest not found." } };
  // FKs cascade visits/notes/tag assignments; survey_responses.guest_id
  // reverts to null.
  const del = await fetch(`${base}/rest/v1/guest_profiles?id=eq.${String(guest.id)}&account_id=eq.${accountId}`, {
    method: "DELETE",
    headers: { ...svc, Prefer: "return=minimal" },
  });
  if (!del.ok) return { status: 502, json: { error: `Could not erase the guest (${del.status}).` } };
  return { status: 200, json: { ok: true } };
}

async function exportGuest(body: CrmBody, accountId: string, base: string, svc: Headers): Promise<CrmResult> {
  // Reuse the full profile fetch — everything held about the guest, in one JSON.
  const full = await getGuest(body, accountId, base, svc);
  if (full.status !== 200) return full;
  return { status: 200, json: { export: full.json, exportedAt: new Date().toISOString() } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function intOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isInteger(v) ? v : fallback;
}

function asRecord(v: unknown): JsonRecord | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : null;
}
function asArray(v: unknown): JsonRecord[] {
  return Array.isArray(v) ? (v as JsonRecord[]) : [];
}

async function getJson(url: string, headers: Headers): Promise<{ ok: boolean; status: number; body: unknown }> {
  const r = await fetch(url, { headers });
  const body = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body };
}
