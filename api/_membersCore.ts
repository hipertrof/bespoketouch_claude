// Shared logic for the member-invite endpoint, used by both the Vercel
// serverless function (api/members.ts) and the dev Vite middleware
// (vite-plugins/members-proxy.ts).
//
// Deliberately dependency-free — plain fetch against Supabase's REST + Auth
// Admin APIs, mirroring api/translate.ts. (An earlier version imported
// @supabase/supabase-js and crashed the serverless function with
// FUNCTION_INVOCATION_FAILED; the SDK doesn't survive the function trace here.)
// Lives in /api as an underscore-prefixed file so Vercel bundles it WITHOUT
// turning it into its own route.
//
// Runs with the SERVICE ROLE key, so it authenticates the caller and authorizes
// the action itself — RLS does not apply to the service role.

const ROLES = ["owner", "manager", "therapist", "frontdesk"] as const;
type Role = (typeof ROLES)[number];

export interface MembersEnv {
  url: string;
  serviceKey: string;
  /** App origin (e.g. https://bespoketouch.vercel.app) — where the invite link
   *  sends a new user to set their password. Derived per-request from Origin. */
  appUrl?: string;
}

export interface MembersResult {
  status: number;
  json: unknown;
}

interface AddMemberBody {
  accountId?: string;
  locationId?: string | null;
  role?: string;
  email?: string;
}

type Headers = Record<string, string>;
type JsonRecord = Record<string, unknown>;

export async function addMember(
  authorization: string | undefined,
  body: AddMemberBody | undefined,
  env: MembersEnv,
): Promise<MembersResult> {
  if (!env.url || !env.serviceKey) {
    return { status: 500, json: { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY is missing." } };
  }

  // Guard against pasting a PUBLIC key instead of the secret one — an easy
  // mix-up (the legacy anon/service_role keys are both eyJ… JWTs; the new keys
  // are sb_publishable_… vs sb_secret_…). A public key silently runs every query
  // under RLS and surfaces as a confusing "Not authorized" 403.
  const keyRole = jwtRole(env.serviceKey);
  const isPublicKey =
    env.serviceKey.startsWith("sb_publishable_") || (keyRole !== null && keyRole !== "service_role");
  if (isPublicKey) {
    const which = keyRole ? `role "${keyRole}"` : "the publishable key";
    return {
      status: 500,
      json: {
        error:
          `SUPABASE_SERVICE_ROLE_KEY looks like a public key (${which}), not the secret ` +
          `service_role key. In Supabase → Project Settings → API, copy the service_role / ` +
          `secret key (not anon / publishable) into Vercel and redeploy.`,
      },
    };
  }

  const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, json: { error: "Missing authorization." } };

  const base = env.url.replace(/\/$/, "");
  const svc: Headers = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` };

  // 1. Identify the caller from their JWT.
  const caller = await getJson(`${base}/auth/v1/user`, {
    apikey: env.serviceKey,
    Authorization: `Bearer ${token}`,
  });
  const callerId = asRecord(caller.body)?.id;
  if (!caller.ok || typeof callerId !== "string") {
    return { status: 401, json: { error: "Invalid or expired session." } };
  }

  // 2. Validate input.
  const accountId = body?.accountId;
  const role = body?.role as Role | undefined;
  const emailRaw = body?.email;
  if (!accountId || !role || !emailRaw) {
    return { status: 400, json: { error: "Missing accountId, role or email." } };
  }
  if (!ROLES.includes(role)) return { status: 400, json: { error: "Invalid role." } };
  const email = String(emailRaw).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: 400, json: { error: "Invalid email address." } };
  }
  const locationId: string | null = role === "owner" ? null : body?.locationId ?? null;
  if (role !== "owner" && !locationId) {
    return { status: 400, json: { error: "A location is required for this role." } };
  }

  // 3. Authorize: platform admin or account owner only.
  const admins = await getJson(
    `${base}/rest/v1/profiles?select=is_platform_admin&user_id=eq.${callerId}`,
    svc,
  );
  const isPlatformAdmin = Boolean(asArray(admins.body)[0]?.is_platform_admin);
  if (!isPlatformAdmin) {
    const owner = await getJson(
      `${base}/rest/v1/memberships?select=id&user_id=eq.${callerId}` +
        `&account_id=eq.${accountId}&role=eq.owner&location_id=is.null`,
      svc,
    );
    if (asArray(owner.body).length === 0) {
      return { status: 403, json: { error: "Not authorized to manage this account." } };
    }
  }

  // 3b. Location-scoped roles must target a location within this account.
  if (locationId) {
    const loc = await getJson(
      `${base}/rest/v1/locations?select=id&id=eq.${locationId}&account_id=eq.${accountId}`,
      svc,
    );
    if (asArray(loc.body).length === 0) {
      return { status: 400, json: { error: "Location does not belong to this account." } };
    }
  }

  // Where the invite/recovery link sends the user to set a password. Must be in
  // Supabase's Redirect URLs allowlist, else generate_link falls back to the
  // project's Site URL (localhost on a fresh project).
  const redirectTo = env.appUrl ? `${env.appUrl.replace(/\/$/, "")}/welcome` : undefined;
  const genLink = (type: "invite" | "recovery") => {
    const payload: Record<string, unknown> = { type, email };
    if (redirectTo) payload.redirect_to = redirectTo;
    return postJson(`${base}/auth/v1/admin/generate_link`, svc, payload);
  };

  // 4. Resolve the target user by email, inviting a new one if needed.
  let targetUserId: string;
  let inviteLink: string | null = null;
  const prof = await getJson(
    `${base}/rest/v1/profiles?select=user_id&email=eq.${encodeURIComponent(email)}`,
    svc,
  );
  const existingProfileId = asArray(prof.body)[0]?.user_id;
  if (typeof existingProfileId === "string") {
    targetUserId = existingProfileId;
    // If they were invited before but never activated (no password set yet),
    // mint a fresh link so the manager can re-send it — the first one may be lost
    // or expired. An already-active user just gets added; they log in normally.
    const au = await getJson(`${base}/auth/v1/admin/users/${targetUserId}`, svc);
    const auRec = asRecord(au.body);
    const activated = Boolean(auRec?.email_confirmed_at ?? auRec?.last_sign_in_at);
    if (!activated) {
      const relink = await genLink("recovery");
      const rb = asRecord(relink.body);
      if (relink.ok && typeof rb?.action_link === "string") inviteLink = rb.action_link;
    }
  } else {
    const link = await genLink("invite");
    const linkBody = asRecord(link.body);
    if (link.ok && typeof linkBody?.id === "string") {
      targetUserId = linkBody.id;
      inviteLink = typeof linkBody.action_link === "string" ? linkBody.action_link : null;
    } else {
      const existing = await findUserByEmail(base, svc, email);
      if (!existing) {
        const msg = typeof linkBody?.msg === "string" ? linkBody.msg : "Could not create the user.";
        return { status: 500, json: { error: msg } };
      }
      targetUserId = existing;
    }
  }

  // 5. Insert the membership (idempotent — unique index rejects duplicates).
  const ins = await fetch(`${base}/rest/v1/memberships`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: targetUserId, account_id: accountId, location_id: locationId, role }),
  });
  const alreadyMember = ins.status === 409;
  if (!ins.ok && !alreadyMember) {
    return { status: 500, json: { error: `Could not add member (${ins.status}).` } };
  }

  return {
    status: 200,
    json: { ok: true, invited: Boolean(inviteLink), alreadyMember, inviteLink },
  };
}

// Pages through auth users to find one by email (fallback for legacy users
// missing a profile row; new invites resolve via profiles directly).
async function findUserByEmail(base: string, svc: Headers, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const r = await getJson(`${base}/auth/v1/admin/users?page=${page}&per_page=200`, svc);
    const rec = asRecord(r.body);
    const users = asArray(rec?.users ?? r.body);
    if (users.length === 0) return null;
    const hit = users.find((u) => String(u.email ?? "").toLowerCase() === email);
    if (hit && typeof hit.id === "string") return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}

// Reads the `role` claim from a Supabase legacy key (a JWT). Returns null for
// non-JWT keys (e.g. the new sb_secret_… format), which are left to pass.
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
