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
  fullName?: string;
  phone?: string;
}

interface UpdateMemberBody {
  membershipId?: string;
  role?: string;
  locationId?: string | null;
  fullName?: string;
  phone?: string;
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

  // 3. Authorize. Three tiers (per the governance model):
  //    - platform admin  → anything
  //    - account owner    → anything in their account
  //    - location manager → operational staff (therapist/frontdesk) on THEIR location
  const admins = await getJson(
    `${base}/rest/v1/profiles?select=is_platform_admin&user_id=eq.${callerId}`,
    svc,
  );
  const isPlatformAdmin = Boolean(asArray(admins.body)[0]?.is_platform_admin);
  // Only a platform admin may create an owner.
  if (role === "owner" && !isPlatformAdmin) {
    return { status: 403, json: { error: "Only a platform admin can add an owner." } };
  }
  if (!isPlatformAdmin) {
    const owner = await getJson(
      `${base}/rest/v1/memberships?select=id&user_id=eq.${callerId}` +
        `&account_id=eq.${accountId}&role=eq.owner&location_id=is.null`,
      svc,
    );
    let authorized = asArray(owner.body).length > 0;

    // A manager may add operational staff to a location they manage — either a
    // manager scoped to that location OR an account-wide manager (location_id
    // null). This matches can_manage_location, AuthContext.canManageLocation, and
    // updateMember; requiring the exact location here (as it once did) 403s an
    // account-wide manager whom the UI had already shown the button to.
    if (!authorized && locationId && (role === "therapist" || role === "frontdesk")) {
      const mgr = await getJson(
        `${base}/rest/v1/memberships?select=id&user_id=eq.${callerId}` +
          `&account_id=eq.${accountId}&role=eq.manager` +
          `&or=(location_id.is.null,location_id.eq.${locationId})`,
        svc,
      );
      authorized = asArray(mgr.body).length > 0;
    }

    if (!authorized) {
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
      // But NEVER hand a password-setting link to a caller for a user who already
      // belongs to a DIFFERENT account. auth.users is global: a recovery link sets
      // the user's one password, so returning it would let this account's manager
      // seize a pending-invite identity that another account owns. Only re-mint
      // when this account is the user's sole (pending) home.
      const elsewhere = await getJson(
        `${base}/rest/v1/memberships?select=id&user_id=eq.${targetUserId}&account_id=neq.${accountId}`,
        svc,
      );
      const belongsElsewhere = asArray(elsewhere.body).length > 0;
      if (!belongsElsewhere) {
        const relink = await genLink("recovery");
        const rb = asRecord(relink.body);
        if (relink.ok && typeof rb?.action_link === "string") inviteLink = rb.action_link;
      }
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

  // 4b. Guarantee profiles.email is populated for this user. The 0006 trigger
  // normally does this on signup, but it can miss (e.g. profile row predates the
  // trigger), leaving the staff list showing a raw UUID. Upsert it here — the
  // client can't read auth.users to recover the email itself. Carries the
  // optional contact details (full_name, phone) from the invite form too.
  const profileRow: Record<string, unknown> = { user_id: targetUserId, email };
  if (typeof body?.fullName === "string" && body.fullName.trim()) profileRow.full_name = body.fullName.trim();
  if (typeof body?.phone === "string" && body.phone.trim()) profileRow.phone = body.phone.trim();
  await fetch(`${base}/rest/v1/profiles`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(profileRow),
  });

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

// Removes a membership. Authorized for platform admin, account owner, or — for a
// therapist/frontdesk target — a manager of that membership's location.
export async function removeMember(
  authorization: string | undefined,
  membershipId: string | undefined,
  env: MembersEnv,
): Promise<MembersResult> {
  if (!env.url || !env.serviceKey) {
    return { status: 500, json: { error: "Server not configured." } };
  }
  if (!membershipId) return { status: 400, json: { error: "Missing membership id." } };

  const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, json: { error: "Missing authorization." } };
  const base = env.url.replace(/\/$/, "");
  const svc: Headers = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` };

  const caller = await getJson(`${base}/auth/v1/user`, {
    apikey: env.serviceKey,
    Authorization: `Bearer ${token}`,
  });
  const callerId = asRecord(caller.body)?.id;
  if (!caller.ok || typeof callerId !== "string") {
    return { status: 401, json: { error: "Invalid or expired session." } };
  }

  const target = asArray(
    (
      await getJson(
        `${base}/rest/v1/memberships?select=account_id,location_id,role&id=eq.${membershipId}`,
        svc,
      )
    ).body,
  )[0];
  if (!target) return { status: 404, json: { error: "Membership not found." } };
  const accountId = String(target.account_id);
  const targetRole = String(target.role);
  const targetLoc = target.location_id ? String(target.location_id) : null;

  const isPlatformAdmin = Boolean(
    asArray(
      (await getJson(`${base}/rest/v1/profiles?select=is_platform_admin&user_id=eq.${callerId}`, svc)).body,
    )[0]?.is_platform_admin,
  );
  // Owners are platform-admin territory on every other path (add/update reserve
  // owner changes for platform admins); removal must match, or a co-owner could
  // delete another owner — or the account's last ownership — here.
  if (targetRole === "owner" && !isPlatformAdmin) {
    return { status: 403, json: { error: "Only a platform admin can remove an owner." } };
  }
  if (!isPlatformAdmin) {
    const isOwner =
      asArray(
        (
          await getJson(
            `${base}/rest/v1/memberships?select=id&user_id=eq.${callerId}` +
              `&account_id=eq.${accountId}&role=eq.owner&location_id=is.null`,
            svc,
          )
        ).body,
      ).length > 0;
    let authorized = isOwner;
    if (!authorized && targetLoc && (targetRole === "therapist" || targetRole === "frontdesk")) {
      authorized =
        asArray(
          (
            await getJson(
              `${base}/rest/v1/memberships?select=id&user_id=eq.${callerId}` +
                `&account_id=eq.${accountId}&role=eq.manager` +
                `&or=(location_id.is.null,location_id.eq.${targetLoc})`,
              svc,
            )
          ).body,
        ).length > 0;
    }
    if (!authorized) return { status: 403, json: { error: "Not authorized to remove this member." } };
  }

  const del = await fetch(`${base}/rest/v1/memberships?id=eq.${membershipId}`, {
    method: "DELETE",
    headers: { ...svc, Prefer: "return=minimal" },
  });
  if (!del.ok) return { status: 500, json: { error: `Could not remove member (${del.status}).` } };
  return { status: 200, json: { ok: true } };
}

// Updates a membership's role/location and the member's contact details.
// Same matrix as add/remove: admin → anything; owner → any non-owner role in
// their account; manager → therapist/frontdesk (current AND new role) on
// locations they manage.
export async function updateMember(
  authorization: string | undefined,
  body: UpdateMemberBody | undefined,
  env: MembersEnv,
): Promise<MembersResult> {
  if (!env.url || !env.serviceKey) {
    return { status: 500, json: { error: "Server not configured." } };
  }
  const membershipId = body?.membershipId;
  if (!membershipId) return { status: 400, json: { error: "Missing membership id." } };

  const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, json: { error: "Missing authorization." } };
  const base = env.url.replace(/\/$/, "");
  const svc: Headers = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` };

  const caller = await getJson(`${base}/auth/v1/user`, {
    apikey: env.serviceKey,
    Authorization: `Bearer ${token}`,
  });
  const callerId = asRecord(caller.body)?.id;
  if (!caller.ok || typeof callerId !== "string") {
    return { status: 401, json: { error: "Invalid or expired session." } };
  }

  const target = asArray(
    (
      await getJson(
        `${base}/rest/v1/memberships?select=user_id,account_id,location_id,role&id=eq.${membershipId}`,
        svc,
      )
    ).body,
  )[0];
  if (!target) return { status: 404, json: { error: "Membership not found." } };
  const accountId = String(target.account_id);
  const targetUserId = String(target.user_id);
  const currentRole = String(target.role);
  const currentLoc = target.location_id ? String(target.location_id) : null;

  const newRole = (body?.role as Role | undefined) ?? (currentRole as Role);
  if (!ROLES.includes(newRole)) return { status: 400, json: { error: "Invalid role." } };
  const newLoc: string | null = newRole === "owner" ? null : (body?.locationId ?? currentLoc);
  if (newRole !== "owner" && !newLoc) {
    return { status: 400, json: { error: "A location is required for this role." } };
  }

  // Authorize.
  const isPlatformAdmin = Boolean(
    asArray(
      (await getJson(`${base}/rest/v1/profiles?select=is_platform_admin&user_id=eq.${callerId}`, svc)).body,
    )[0]?.is_platform_admin,
  );
  if ((newRole === "owner" || currentRole === "owner") && !isPlatformAdmin) {
    return { status: 403, json: { error: "Only a platform admin can change owners." } };
  }
  if (!isPlatformAdmin) {
    const isOwner =
      asArray(
        (
          await getJson(
            `${base}/rest/v1/memberships?select=id&user_id=eq.${callerId}` +
              `&account_id=eq.${accountId}&role=eq.owner&location_id=is.null`,
            svc,
          )
        ).body,
      ).length > 0;
    let authorized = isOwner;
    const opsRoles = ["therapist", "frontdesk"];
    if (!authorized && opsRoles.includes(currentRole) && opsRoles.includes(newRole) && currentLoc && newLoc) {
      // Manager must manage BOTH the current and the new location.
      const mgrLocs = asArray(
        (
          await getJson(
            `${base}/rest/v1/memberships?select=location_id&user_id=eq.${callerId}` +
              `&account_id=eq.${accountId}&role=eq.manager`,
            svc,
          )
        ).body,
      ).map((m) => (m.location_id ? String(m.location_id) : null));
      const manages = (loc: string) => mgrLocs.includes(null) || mgrLocs.includes(loc);
      authorized = mgrLocs.length > 0 && manages(currentLoc) && manages(newLoc);
    }
    if (!authorized) return { status: 403, json: { error: "Not authorized to update this member." } };
  }

  // New location must belong to the same account.
  if (newLoc && newLoc !== currentLoc) {
    const loc = await getJson(
      `${base}/rest/v1/locations?select=id&id=eq.${newLoc}&account_id=eq.${accountId}`,
      svc,
    );
    if (asArray(loc.body).length === 0) {
      return { status: 400, json: { error: "Location does not belong to this account." } };
    }
  }

  const patch = await fetch(`${base}/rest/v1/memberships?id=eq.${membershipId}`, {
    method: "PATCH",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ role: newRole, location_id: newLoc }),
  });
  if (!patch.ok) return { status: 500, json: { error: `Could not update member (${patch.status}).` } };

  // Contact details live on the profile (empty string clears the field).
  const profilePatch: Record<string, unknown> = {};
  if (typeof body?.fullName === "string") profilePatch.full_name = body.fullName.trim() || null;
  if (typeof body?.phone === "string") profilePatch.phone = body.phone.trim() || null;
  if (Object.keys(profilePatch).length > 0) {
    const pp = await fetch(`${base}/rest/v1/profiles?user_id=eq.${targetUserId}`, {
      method: "PATCH",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(profilePatch),
    });
    if (!pp.ok) return { status: 500, json: { error: `Could not update profile (${pp.status}).` } };
  }

  return { status: 200, json: { ok: true } };
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
