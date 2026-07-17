import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Copy, Check, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { supabase } from "../../lib/supabase";
import {
  addMember,
  listMembers,
  removeMember,
  updateMember,
  type MemberRole,
  type MemberRow,
} from "../../lib/members";
import { t, tf } from "../../i18n/translations";
import { Button } from "../Button";
import { LanguageSelector } from "../LanguageSelector";

interface AccountLite {
  id: string;
  name: string;
}
interface LocationLite {
  id: string;
  name: string;
}

const ROLE_KEYS: Record<MemberRole, string> = {
  owner: "roleOwner",
  manager: "roleManager",
  therapist: "roleTherapist",
  frontdesk: "roleFrontdesk",
};

// Staff management: invite members (by email) with a role, scoped to a location
// (or account-wide for owners), and remove them. Adding goes through the
// service-role /api/members endpoint (creates the auth user if new); listing and
// removing use the client under RLS. Intended for account owners / platform
// admins — others can open it but the endpoint + RLS reject their writes.
export function StaffManagement() {
  const { user, loading, rolesReady, canManage, canManageLocation, memberships, isPlatformAdmin, signOut } =
    useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  // Deep link from the admin dashboard: /staff?account=<id> preselects the account.
  const [searchParams] = useSearchParams();
  const requestedAccount = searchParams.get("account");

  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [accountId, setAccountId] = useState("");
  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Route gate: signed in AND able to manage staff (platform admin, owner, or
  // manager). Others are sent to the therapist queue.
  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/login");
    else if (rolesReady && !canManage) navigate("/queue");
  }, [loading, user, rolesReady, canManage, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("accounts")
      .select("id, name")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(errMessage(error, "Failed to load accounts."));
        else {
          const list = (data as AccountLite[]) ?? [];
          setAccounts(list);
          const preferred =
            requestedAccount && list.some((a) => a.id === requestedAccount) ? requestedAccount : list[0]?.id;
          if (preferred) setAccountId((prev) => prev || preferred);
        }
      });
  }, [user, requestedAccount]);

  const load = useCallback(async (accId: string) => {
    setError(null);
    try {
      const [mem, locs] = await Promise.all([
        listMembers(accId),
        supabase.from("locations").select("id, name").eq("account_id", accId).order("name"),
      ]);
      if (locs.error) throw locs.error;
      setMembers(mem);
      // Only offer locations the caller can actually manage staff for.
      const manageable = ((locs.data as { id: string; name: string }[]) ?? [])
        .filter((l) => canManageLocation({ id: l.id, account_id: accId }))
        .map((l) => ({ id: l.id, name: l.name }));
      setLocations(manageable);
    } catch (e) {
      setError(errMessage(e, "Failed to load."));
    }
  }, [canManageLocation]);

  useEffect(() => {
    if (accountId && rolesReady) load(accountId);
  }, [accountId, rolesReady, load]);

  // Roles the caller may grant on this account (spec: only admin creates owners;
  // owners create manager/therapist/frontdesk; managers create therapist/frontdesk).
  const isAccountOwner = memberships.some(
    (m) => m.account_id === accountId && m.role === "owner" && m.location_id === null,
  );
  const isAccountManager = memberships.some((m) => m.account_id === accountId && m.role === "manager");
  const allowedRoles: MemberRole[] = isPlatformAdmin
    ? ["owner", "manager", "therapist", "frontdesk"]
    : isAccountOwner
      ? ["manager", "therapist", "frontdesk"]
      : isAccountManager
        ? ["therapist", "frontdesk"]
        : [];

  // Whether the caller may edit/remove this member (same matrix as the server):
  // admin → anyone; owner → non-owners; manager → therapist/frontdesk on their locations.
  const canEditTarget = (m: MemberRow) =>
    isPlatformAdmin ||
    (isAccountOwner && m.role !== "owner") ||
    ((m.role === "therapist" || m.role === "frontdesk") &&
      memberships.some(
        (mgr) =>
          mgr.account_id === accountId &&
          mgr.role === "manager" &&
          (mgr.location_id === null || mgr.location_id === m.location_id),
      ));

  // Visibility (spec): admin sees all; owner sees manager/therapist/frontdesk;
  // manager sees therapist/frontdesk AND fellow managers on their locations
  // (read-only for the managers — edit/remove stays ops-only).
  const visibleMembers = members.filter((m) => {
    if (isPlatformAdmin) return true;
    if (isAccountOwner) return m.role !== "owner";
    return (
      m.role !== "owner" &&
      memberships.some(
        (mgr) =>
          mgr.account_id === accountId &&
          mgr.role === "manager" &&
          (mgr.location_id === null || mgr.location_id === m.location_id),
      )
    );
  });

  const locationName = (id: string | null) =>
    id ? locations.find((l) => l.id === id)?.name ?? id : t("staffLocationAll", lang);

  async function handleRemove(m: MemberRow) {
    if (!confirm(tf("staffRemoveConfirm", lang, { email: m.email ?? m.user_id }))) return;
    setError(null);
    try {
      await removeMember(m.id);
      setMembers((prev) => prev.filter((x) => x.id !== m.id));
    } catch (e) {
      setError(errMessage(e, "Failed to remove."));
    }
  }

  if (loading || !rolesReady) return <Centered>{t("loading", lang)}</Centered>;
  if (!user || !canManage) return null;

  return (
    <div className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-charcoal">{t("staffTitle", lang)}</h1>
            <p className="text-sm text-slate">{user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/manage" className="text-sm font-medium text-sage-dark hover:underline">
              {t("offer", lang)}
            </Link>
            <Link to="/queue" className="text-sm font-medium text-sage-dark hover:underline">
              {t("queueNav", lang)}
            </Link>
            <Link to="/kiosks" className="text-sm font-medium text-sage-dark hover:underline">
              {t("kiosksNav", lang)}
            </Link>
            <Link to="/reports" className="text-sm font-medium text-sage-dark hover:underline">
              {t("surveyNav", lang)}
            </Link>
            <LanguageSelector />
            <Button variant="ghost" onClick={() => signOut()}>
              {t("signOut", lang)}
            </Button>
          </div>
        </header>

        {error && <p className="mb-4 text-sm text-rose-dark">{error}</p>}

        {accounts.length === 0 ? (
          <p className="text-slate">{t("staffNoAccounts", lang)}</p>
        ) : (
          <>
            <div className="mb-6 flex max-w-sm flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
              {t("staffAccountLabel", lang)}
              {accounts.length > 1 ? (
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className={inputClass}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-base font-normal normal-case tracking-normal text-charcoal">
                  {accounts[0]?.name}
                </span>
              )}
            </div>

            <InviteForm
              accountId={accountId}
              locations={locations}
              allowedRoles={allowedRoles}
              onAdded={() => load(accountId)}
            />

            <section className="mt-8">
              <h2 className="mb-3 font-serif text-xl text-charcoal">{t("staffMembers", lang)}</h2>
              {visibleMembers.length === 0 ? (
                <p className="text-slate">{t("staffNoMembers", lang)}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {visibleMembers.map((m) =>
                    editingId === m.id ? (
                      <li key={m.id} className="rounded-2xl bg-white p-4 shadow-soft">
                        <MemberEditor
                          member={m}
                          locations={locations}
                          allowedRoles={allowedRoles}
                          onDone={() => {
                            setEditingId(null);
                            load(accountId);
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      </li>
                    ) : (
                      <li
                        key={m.id}
                        className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-soft"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-charcoal">
                            {m.fullName ?? m.email ?? m.user_id}
                          </div>
                          <div className="truncate text-xs text-slate-light">
                            {[m.fullName ? m.email : null, m.phone, locationName(m.location_id)]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        <span className="rounded-full bg-sage-tint px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-sage-dark">
                          {t(ROLE_KEYS[m.role as MemberRole] ?? "staffRole", lang)}
                        </span>
                        {canEditTarget(m) && (
                          <button
                            type="button"
                            onClick={() => setEditingId(m.id)}
                            aria-label={t("staffEdit", lang)}
                            className="text-slate-light hover:text-sage-dark"
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        {canEditTarget(m) && (
                          <button
                            type="button"
                            onClick={() => handleRemove(m)}
                            aria-label={t("staffRemove", lang)}
                            className="text-slate-light hover:text-rose-dark"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// Inline editor for one member: role, location, name, phone. Saves through the
// service-role endpoint (same authorization matrix as add/remove).
function MemberEditor({
  member,
  locations,
  allowedRoles,
  onDone,
  onCancel,
}: {
  member: MemberRow;
  locations: LocationLite[];
  allowedRoles: MemberRole[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { lang } = useLanguage();
  const roleOptions = allowedRoles.includes(member.role as MemberRole)
    ? allowedRoles
    : [member.role as MemberRole, ...allowedRoles];
  const [role, setRole] = useState<MemberRole>(member.role as MemberRole);
  const [locationId, setLocationId] = useState(member.location_id ?? "");
  const [fullName, setFullName] = useState(member.fullName ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsLocation = role !== "owner";

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsLocation && !locationId) {
      setError(t("locationLabel", lang));
      return;
    }
    setBusy(true);
    try {
      await updateMember({
        membershipId: member.id,
        role,
        locationId: needsLocation ? locationId : null,
        fullName,
        phone,
      });
      onDone();
    } catch (e2) {
      setError(errMessage(e2, "Failed."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="text-sm font-medium text-charcoal">{member.email ?? member.user_id}</div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-44 flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("staffName", lang)}
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </label>
        <label className="flex min-w-36 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("staffPhone", lang)}
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("staffRole", lang)}
          <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className={inputClass}>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {t(ROLE_KEYS[r], lang)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("locationLabel", lang)}
          <select
            value={needsLocation ? locationId : ""}
            onChange={(e) => setLocationId(e.target.value)}
            disabled={!needsLocation}
            className={`${inputClass} disabled:opacity-40`}
          >
            <option value="">{needsLocation ? "—" : t("staffLocationAll", lang)}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? t("staffInviting", lang) : t("save", lang)}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("staffCancel", lang)}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-rose-dark">{error}</p>}
    </form>
  );
}

function InviteForm({
  accountId,
  locations,
  allowedRoles,
  onAdded,
}: {
  accountId: string;
  locations: LocationLite[];
  allowedRoles: MemberRole[];
  onAdded: () => void;
}) {
  const { lang } = useLanguage();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<MemberRole>(allowedRoles[0] ?? "therapist");
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Keep the selected role valid as allowedRoles resolves.
  useEffect(() => {
    if (allowedRoles.length > 0 && !allowedRoles.includes(role)) setRole(allowedRoles[0]);
  }, [allowedRoles, role]);

  const needsLocation = role !== "owner";
  // Spec: every non-owner role needs a location, so with no manageable location
  // there is nobody to add — prompt to create one first.
  const noLocations = needsLocation && locations.length === 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setInviteLink(null);
    setCopied(false);
    if (needsLocation && !locationId) {
      setError(t("locationLabel", lang));
      return;
    }
    setBusy(true);
    try {
      const res = await addMember({
        accountId,
        locationId: needsLocation ? locationId : null,
        role,
        email: email.trim(),
        fullName: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      if (res.alreadyMember) setNotice(t("staffAlreadyMember", lang));
      else setNotice(t("staffAdded", lang));
      if (res.inviteLink) setInviteLink(res.inviteLink);
      setEmail("");
      setFullName("");
      setPhone("");
      onAdded();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      // clipboard blocked — the link is still visible to copy manually
    }
  }

  return (
    <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-soft">
      <h2 className="mb-4 font-serif text-xl text-charcoal">{t("staffInvite", lang)}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("staffEmail", lang)}
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="anna@nusaspa.pl"
          />
        </label>
        <label className="flex min-w-44 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("staffName", lang)}
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </label>
        <label className="flex min-w-36 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("staffPhone", lang)}
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("staffRole", lang)}
          <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className={inputClass}>
            {allowedRoles.map((r) => (
              <option key={r} value={r}>
                {t(ROLE_KEYS[r], lang)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("locationLabel", lang)}
          <select
            value={needsLocation ? locationId : ""}
            onChange={(e) => setLocationId(e.target.value)}
            disabled={!needsLocation}
            className={`${inputClass} disabled:opacity-40`}
          >
            <option value="">{needsLocation ? "—" : t("staffLocationAll", lang)}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={busy || !accountId || noLocations}>
          {busy ? t("staffInviting", lang) : t("staffAdd", lang)}
        </Button>
      </div>

      {noLocations && <p className="mt-3 text-sm text-rose-dark">{t("staffNeedLocationFirst", lang)}</p>}
      {error && <p className="mt-3 text-sm text-rose-dark">{error}</p>}
      {notice && <p className="mt-3 text-sm text-sage-dark">{notice}</p>}
      {inviteLink && (
        <div className="mt-3 rounded-xl bg-oatmeal p-3">
          <p className="mb-2 text-xs text-slate">{t("staffInviteLinkNote", lang)}</p>
          <div className="flex items-center gap-2">
            <input readOnly value={inviteLink} className={`${inputClass} flex-1 text-xs`} />
            <Button type="button" variant="secondary" onClick={copyLink}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t("staffCopied", lang) : t("staffCopy", lang)}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6 text-slate">
      {children}
    </div>
  );
}

const inputClass =
  "min-h-11 rounded-xl border border-sand bg-cream px-3 text-charcoal outline-none focus:border-sage";

// Supabase/PostgREST errors are plain objects, not Error instances — so a bare
// `e instanceof Error` check drops their real message. Pull out whatever detail
// is present (message / details / hint / code) for an actionable error.
function errMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    );
    if (parts.length > 0) return parts.join(" · ");
  }
  return fallback;
}
