import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Copy, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { subscriptionStatus } from "../../lib/billing";
import { Button } from "../Button";
import { DashboardShell } from "../DashboardShell";

interface Account {
  id: string;
  name: string;
  plan: string | null;
  slots_paid: number;
  subscription_start: string | null;
  subscription_end: string | null;
  created_at: string;
}

// Platform Admin dashboard (god mode): create accounts and set their slots +
// subscription dates. Access is gated by profiles.is_platform_admin; the RLS
// policies (accounts_admin_write) also enforce this at the database.
export function PlatformAdminDashboard() {
  const { user, loading, isPlatformAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  const load = useCallback(async () => {
    setFetching(true);
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setListError(error.message);
    else setAccounts(data as Account[]);
    setFetching(false);
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (isPlatformAdmin) load();
  }, [isPlatformAdmin, load]);

  if (loading) return <Centered>Ładowanie…</Centered>;
  if (!user) return null; // redirecting
  if (!isPlatformAdmin) {
    return (
      <Centered>
        <div className="text-center">
          <p className="text-charcoal">Jesteś zalogowany, ale nie masz uprawnień administratora platformy.</p>
          <Button variant="secondary" className="mt-4" onClick={() => signOut()}>
            Wyloguj się
          </Button>
        </div>
      </Centered>
    );
  }

  return (
    <DashboardShell title="Administrator Platformy">
      <CreateAccountForm onCreated={load} />

      <section className="mt-10">
        <h2 className="mb-3 font-serif text-xl text-charcoal">Konta</h2>
        {listError && <p className="text-sm text-rose-dark">{listError}</p>}
        {fetching ? (
          <p className="text-slate">Ładowanie kont…</p>
        ) : accounts.length === 0 ? (
          <p className="text-slate">Brak kont. Utwórz jedno powyżej.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {accounts.map((a) => (
              <AccountRow key={a.id} account={a} onSaved={load} />
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6 text-slate">
      {children}
    </div>
  );
}

// Location UUIDs are only needed occasionally (support, SQL). Showing the raw
// hex inline made every row noisy, so it's tucked behind a copy button that
// exposes the full id on hover and copies it on click.
function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={id}
      onClick={() => {
        void navigator.clipboard?.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-slate-light transition-colors hover:bg-sand/60 hover:text-slate"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "Skopiowano" : "ID"}
    </button>
  );
}

function CreateAccountForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [slots, setSlots] = useState(1);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.from("accounts").insert({
      name: name.trim(),
      slots_paid: slots,
      subscription_start: start || null,
      subscription_end: end || null,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setSlots(1);
    setStart("");
    setEnd("");
    onCreated();
  }

  return (
    <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-soft">
      <h2 className="mb-4 font-serif text-xl text-charcoal">Nowe konto</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nazwa spa / firmy">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Nusa Spa"
          />
        </Field>
        <Field label="Opłacone stanowiska">
          <input
            type="number"
            min={0}
            value={slots}
            onChange={(e) => setSlots(Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label="Początek subskrypcji">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Koniec subskrypcji">
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </Field>
      </div>
      {error && <p className="mt-3 text-sm text-rose-dark">{error}</p>}
      <Button type="submit" disabled={busy} className="mt-4">
        {busy ? "Tworzenie…" : "Utwórz konto"}
      </Button>
    </form>
  );
}

function AccountRow({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const [slots, setSlots] = useState(account.slots_paid);
  const [start, setStart] = useState(account.subscription_start ?? "");
  const [end, setEnd] = useState(account.subscription_end ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLocations, setShowLocations] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const dirty =
    slots !== account.slots_paid ||
    start !== (account.subscription_start ?? "") ||
    end !== (account.subscription_end ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("accounts")
      .update({ slots_paid: slots, subscription_start: start || null, subscription_end: end || null })
      .eq("id", account.id);
    setBusy(false);
    if (error) setError(error.message);
    else onSaved();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("accounts").delete().eq("id", account.id);
    setBusy(false);
    if (error) setError(error.message);
    else onSaved();
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-40 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-lg text-charcoal">{account.name}</span>
            {/* Reflects the saved date, not the edit box above it. */}
            <SubscriptionChip end={account.subscription_end} />
          </div>
          <div className="text-xs text-slate-light">{account.plan ?? "no plan"}</div>
        </div>
        <Field label="Stanowiska">
          <input
            type="number"
            min={0}
            value={slots}
            onChange={(e) => setSlots(Number(e.target.value))}
            className={`${inputClass} w-24`}
          />
        </Field>
        <Field label="Początek">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Koniec">
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </Field>
        <Button variant="secondary" disabled={!dirty || busy} onClick={save}>
          {busy ? "Zapisywanie…" : "Zapisz"}
        </Button>
        <button
          type="button"
          onClick={() => setConfirmDelete((v) => !v)}
          disabled={busy}
          title="Usuń konto"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-rose-dark hover:bg-rose-tint disabled:opacity-50"
        >
          <Trash2 size={16} />
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-dark">{error}</p>}
      {confirmDelete && (
        <div className="mt-3 rounded-xl bg-rose-tint/40 p-4">
          <p className="text-sm text-rose-dark">
            Usuwa konto i wszystkie jego lokalizacje, kioski, profile gości, ankiety — nieodwracalne. Wpisz nazwę
            konta, aby potwierdzić.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={account.name}
              className={inputClass}
            />
            <Button
              variant="secondary"
              disabled={busy || confirmName.trim() !== account.name}
              onClick={remove}
              className="border-rose-dark text-rose-dark hover:bg-rose-tint"
            >
              {busy ? "Usuwanie…" : "Usuń konto"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setConfirmDelete(false);
                setConfirmName("");
              }}
            >
              Anuluj
            </Button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setShowLocations((v) => !v)}
        className="mt-3 text-xs font-medium text-sage-dark hover:underline"
      >
        {showLocations ? "Ukryj lokalizacje" : "Zarządzaj lokalizacjami"}
      </button>
      {showLocations && <LocationsSection accountId={account.id} />}
    </div>
  );
}

// Which accounts to chase. The client-facing reminder is soft and lives on the
// manager dashboards (SubscriptionBanner); this is the operator's view of the
// same subscriptionStatus() call, so the two can never disagree.
function SubscriptionChip({ end }: { end: string | null }) {
  const status = subscriptionStatus(end);
  if (!status || status.state === "ok") return null;
  const lapsed = status.state === "lapsed";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        lapsed ? "bg-rose-tint text-rose-dark" : "bg-clay-tint text-clay-dark"
      }`}
    >
      {lapsed ? "Wygasła" : "Kończy się wkrótce"}
    </span>
  );
}

interface LocationLite {
  id: string;
  name: string;
  active: boolean;
}

// Locations under one account. Platform admin can create them here (RLS
// allows platform admin to write locations); the Offer CMS then edits each
// location's services. Bridges the gap until the Account Owner dashboard.
function LocationsSection({ accountId }: { accountId: string }) {
  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("locations")
      .select("id, name, active")
      .eq("account_id", accountId)
      .order("name", { ascending: true });
    if (error) setError(error.message);
    else setLocations((data as LocationLite[]) ?? []);
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("locations").insert({ account_id: accountId, name: name.trim() });
    setBusy(false);
    if (error) setError(error.message);
    else {
      setName("");
      load();
    }
  }

  async function remove(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("locations").delete().eq("id", id);
    setBusy(false);
    setConfirmDeleteId(null);
    if (error) setError(error.message);
    else load();
  }

  return (
    <div className="mt-3 rounded-xl bg-oatmeal p-4">
      {locations.length === 0 ? (
        <p className="mb-3 text-xs text-slate">Brak lokalizacji.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1 text-sm text-charcoal">
          {locations.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2">
              <span>{l.name}</span>
              {!l.active && <span className="text-xs text-slate-light">(nieaktywna)</span>}
              <CopyId id={l.id} />
              <span className="ml-auto flex gap-3">
                <Link
                  to={`/manage?location=${l.id}`}
                  className="text-xs font-medium text-sage-dark hover:underline"
                >
                  Oferta
                </Link>
                <Link
                  to={`/staff?account=${accountId}`}
                  className="text-xs font-medium text-sage-dark hover:underline"
                >
                  Personel
                </Link>
                <Link
                  to={`/kiosks?location=${l.id}`}
                  className="text-xs font-medium text-sage-dark hover:underline"
                >
                  Kioski
                </Link>
                <button
                  type="button"
                  onClick={() => remove(l.id)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-xs font-medium text-rose-dark hover:underline disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  {confirmDeleteId === l.id ? "Na pewno?" : "Usuń"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={create} className="flex items-end gap-2">
        <Field label="Nazwa nowej lokalizacji">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Nusa Spa — Wrocław"
          />
        </Field>
        <Button variant="secondary" type="submit" disabled={busy}>
          {busy ? "Dodawanie…" : "Dodaj"}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-rose-dark">{error}</p>}
    </div>
  );
}

const inputClass =
  "min-h-11 rounded-xl border border-sand bg-cream px-3 text-charcoal outline-none focus:border-sage";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
      {label}
      {children}
    </label>
  );
}
