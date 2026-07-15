import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Shared logic for the member-invite endpoint, used by both the Vercel
// serverless function (api/members.ts) and the dev-only Vite middleware
// (vite-plugins/members-proxy.ts). Runs with the SERVICE ROLE key, so it must
// authenticate the caller and authorize the action itself — RLS does not apply.

const ROLES = ["owner", "manager", "therapist", "frontdesk"] as const;
type Role = (typeof ROLES)[number];

export interface MembersEnv {
  url: string;
  serviceKey: string;
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

// Adds (inviting if necessary) a member to an account, optionally scoped to a
// location. Returns an invite link when a brand-new auth user was created, so
// the owner can pass it to the staffer to set their password.
export async function addMember(
  authorization: string | undefined,
  body: AddMemberBody | undefined,
  env: MembersEnv,
): Promise<MembersResult> {
  if (!env.url || !env.serviceKey) {
    return { status: 500, json: { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY is missing." } };
  }

  const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, json: { error: "Missing authorization." } };

  const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false } });

  // 1. Identify the caller from their JWT.
  const { data: userData, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !userData?.user) return { status: 401, json: { error: "Invalid or expired session." } };
  const callerId = userData.user.id;

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
  // Owner is account-wide (no location); every other role must be scoped to one.
  const locationId: string | null = role === "owner" ? null : body?.locationId ?? null;
  if (role !== "owner" && !locationId) {
    return { status: 400, json: { error: "A location is required for this role." } };
  }

  // 3. Authorize: only a platform admin or an account owner may add members.
  if (!(await callerCanManageAccount(admin, callerId, accountId))) {
    return { status: 403, json: { error: "Not authorized to manage this account." } };
  }

  // 3b. A location-scoped role must target a location within this account.
  if (locationId) {
    const { data: loc } = await admin
      .from("locations")
      .select("id")
      .eq("id", locationId)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!loc) return { status: 400, json: { error: "Location does not belong to this account." } };
  }

  // 4. Resolve the target user by email, creating (inviting) them if new.
  let targetUserId: string;
  let inviteLink: string | null = null;
  const { data: prof } = await admin
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();

  if (prof?.user_id) {
    targetUserId = prof.user_id as string;
  } else {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
    });
    if (linkData?.user) {
      targetUserId = linkData.user.id;
      inviteLink = linkData.properties?.action_link ?? null;
    } else {
      // generateLink rejects an already-registered email; fall back to a lookup
      // (covers auth users created before the profile-email backfill).
      const existingId = await findAuthUserByEmail(admin, email);
      if (!existingId) {
        return { status: 500, json: { error: linkErr?.message ?? "Could not create the user." } };
      }
      targetUserId = existingId;
    }
  }

  // 5. Insert the membership (idempotent — the unique index rejects duplicates).
  const { error: mErr } = await admin.from("memberships").insert({
    user_id: targetUserId,
    account_id: accountId,
    location_id: locationId,
    role,
  });
  const alreadyMember = Boolean(mErr) && /duplicate|unique/i.test(mErr!.message);
  if (mErr && !alreadyMember) {
    return { status: 500, json: { error: mErr.message } };
  }

  return {
    status: 200,
    json: { ok: true, invited: Boolean(inviteLink), alreadyMember, inviteLink },
  };
}

async function callerCanManageAccount(
  admin: SupabaseClient,
  callerId: string,
  accountId: string,
): Promise<boolean> {
  const { data: p } = await admin
    .from("profiles")
    .select("is_platform_admin")
    .eq("user_id", callerId)
    .maybeSingle();
  if (p?.is_platform_admin) return true;

  const { data: m } = await admin
    .from("memberships")
    .select("id")
    .eq("user_id", callerId)
    .eq("account_id", accountId)
    .eq("role", "owner")
    .is("location_id", null)
    .maybeSingle();
  return Boolean(m);
}

// Pages through auth users to find one by email. Only a fallback for legacy
// users missing a profile row; new invites resolve via profiles directly.
async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
