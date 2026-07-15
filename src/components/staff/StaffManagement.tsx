import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, Check, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { supabase } from "../../lib/supabase";
import {
  addMember,
  listMembers,
  removeMember,
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
  const { user, loading, signOut } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [accountId, setAccountId] = useState("");
  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("accounts")
      .select("id, name")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setAccounts((data as AccountLite[]) ?? []);
          if (data && data.length > 0) setAccountId((prev) => prev || data[0].id);
        }
      });
  }, [user]);

  const load = useCallback(async (accId: string) => {
    setError(null);
    try {
      const [mem, locs] = await Promise.all([
        listMembers(accId),
        supabase.from("locations").select("id, name").eq("account_id", accId).order("name"),
      ]);
      setMembers(mem);
      setLocations((locs.data as LocationLite[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    }
  }, []);

  useEffect(() => {
    if (accountId) load(accountId);
  }, [accountId, load]);

  const locationName = (id: string | null) =>
    id ? locations.find((l) => l.id === id)?.name ?? id : t("staffLocationAll", lang);

  async function handleRemove(m: MemberRow) {
    if (!confirm(tf("staffRemoveConfirm", lang, { email: m.email ?? m.user_id }))) return;
    setError(null);
    try {
      await removeMember(m.id);
      setMembers((prev) => prev.filter((x) => x.id !== m.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove.");
    }
  }

  if (loading) return <Centered>{t("loading", lang)}</Centered>;
  if (!user) return null;

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
            {accounts.length > 1 && (
              <label className="mb-6 flex max-w-sm flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
                {t("staffAccountLabel", lang)}
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
              </label>
            )}

            <InviteForm
              accountId={accountId}
              locations={locations}
              onAdded={() => load(accountId)}
            />

            <section className="mt-8">
              <h2 className="mb-3 font-serif text-xl text-charcoal">{t("staffMembers", lang)}</h2>
              {members.length === 0 ? (
                <p className="text-slate">{t("staffNoMembers", lang)}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {members.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-soft"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-charcoal">
                          {m.email ?? m.fullName ?? m.user_id}
                        </div>
                        <div className="text-xs text-slate-light">{locationName(m.location_id)}</div>
                      </div>
                      <span className="rounded-full bg-sage-tint px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-sage-dark">
                        {t(ROLE_KEYS[m.role as MemberRole] ?? "staffRole", lang)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemove(m)}
                        aria-label={t("staffRemove", lang)}
                        className="text-slate-light hover:text-rose-dark"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function InviteForm({
  accountId,
  locations,
  onAdded,
}: {
  accountId: string;
  locations: LocationLite[];
  onAdded: () => void;
}) {
  const { lang } = useLanguage();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("therapist");
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const needsLocation = role !== "owner";

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
      });
      if (res.alreadyMember) setNotice(t("staffAlreadyMember", lang));
      else setNotice(t("staffAdded", lang));
      if (res.inviteLink) setInviteLink(res.inviteLink);
      setEmail("");
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
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("staffRole", lang)}
          <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className={inputClass}>
            {(Object.keys(ROLE_KEYS) as MemberRole[]).map((r) => (
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
        <Button type="submit" disabled={busy || !accountId}>
          {busy ? t("staffInviting", lang) : t("staffAdd", lang)}
        </Button>
      </div>

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
