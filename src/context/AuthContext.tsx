import { createContext, useContext, useEffect, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export interface MembershipLite {
  role: string;
  location_id: string | null;
  account_id: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Whether the signed-in user is a platform admin (from profiles.is_platform_admin). */
  isPlatformAdmin: boolean;
  /** The signed-in user's memberships (role + scope), for client-side role gating. */
  memberships: MembershipLite[];
  /** True once isPlatformAdmin + memberships have been resolved for the current user. */
  rolesReady: boolean;
  /** Can manage offers/staff somewhere: platform admin, or an owner/manager membership. */
  canManage: boolean;
  /** Whether the user can manage a specific location (mirrors can_manage_location RLS). */
  canManageLocation: (loc: { id: string; account_id: string }) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [memberships, setMemberships] = useState<MembershipLite[]>([]);
  const [rolesReady, setRolesReady] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription?.unsubscribe();
  }, []);

  // Load the platform-admin flag + memberships whenever the user changes.
  useEffect(() => {
    if (!user) {
      setIsPlatformAdmin(false);
      setMemberships([]);
      setRolesReady(false);
      return;
    }
    let active = true;
    setRolesReady(false);
    Promise.all([
      supabase.from("profiles").select("is_platform_admin").eq("user_id", user.id).maybeSingle(),
      supabase.from("memberships").select("role, location_id, account_id").eq("user_id", user.id),
    ]).then(([prof, mem]) => {
      if (!active) return;
      setIsPlatformAdmin(Boolean(prof.data?.is_platform_admin));
      setMemberships((mem.data as MembershipLite[]) ?? []);
      setRolesReady(true);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const canManage =
    isPlatformAdmin || memberships.some((m) => m.role === "owner" || m.role === "manager");

  const canManageLocation = (loc: { id: string; account_id: string }) =>
    isPlatformAdmin ||
    memberships.some(
      (m) =>
        m.account_id === loc.account_id &&
        ((m.role === "owner" && m.location_id === null) ||
          (m.role === "manager" && (m.location_id === null || m.location_id === loc.id))),
    );

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, isPlatformAdmin, memberships, rolesReady, canManage, canManageLocation, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
