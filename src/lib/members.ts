import { supabase } from "./supabase";

// A membership joined with the member's profile (email / name). memberships and
// profiles both key off auth.users but have no direct FK between them, so we
// can't PostgREST-embed — we fetch both and merge (see listMembers).
export interface MemberRow {
  id: string;
  user_id: string;
  account_id: string;
  location_id: string | null;
  role: string;
  created_at: string;
  email: string | null;
  fullName: string | null;
}

export type MemberRole = "owner" | "manager" | "therapist" | "frontdesk";

// All memberships for an account, newest first, with each member's email/name.
// RLS restricts the result to accounts the caller can access.
export async function listMembers(accountId: string): Promise<MemberRow[]> {
  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("id, user_id, account_id, location_id, role, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!memberships || memberships.length === 0) return [];

  const userIds = [...new Set(memberships.map((m) => m.user_id as string))];
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("user_id, email, full_name")
    .in("user_id", userIds);
  if (pErr) throw pErr;

  const byId = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));
  return memberships.map((m) => {
    const p = byId.get(m.user_id as string);
    return {
      id: m.id as string,
      user_id: m.user_id as string,
      account_id: m.account_id as string,
      location_id: (m.location_id as string | null) ?? null,
      role: m.role as string,
      created_at: m.created_at as string,
      email: (p?.email as string | null) ?? null,
      fullName: (p?.full_name as string | null) ?? null,
    };
  });
}

export interface AddMemberResult {
  invited: boolean; // a brand-new auth user was created
  alreadyMember: boolean; // membership already existed (no-op)
  inviteLink: string | null; // password-set link for a newly invited user
}

// Invites (or attaches) a member via the service-role backend. Passes the
// caller's access token so the endpoint can authorize the action.
export async function addMember(params: {
  accountId: string;
  locationId: string | null;
  role: MemberRole;
  email: string;
}): Promise<AddMemberResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const res = await fetch("/api/members", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) ?? `Request failed (${res.status})`);
  return {
    invited: Boolean(json.invited),
    alreadyMember: Boolean(json.alreadyMember),
    inviteLink: (json.inviteLink as string | null) ?? null,
  };
}

// Removes a membership via the service-role backend, which authorizes the caller
// (platform admin, account owner, or a manager of the target's location).
export async function removeMember(membershipId: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const res = await fetch("/api/members", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ membershipId }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error((json.error as string) ?? `Request failed (${res.status})`);
  }
}
