import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { supabase } from "../../lib/supabase";
import { listSlots, fetchSlotsPaid, type SlotRow } from "../../lib/slots";
import { createSlot, repairSlot, revokeSlot } from "../../lib/pairing";
import { t, tf } from "../../i18n/translations";
import type { LangCode } from "../../types";
import { Button } from "../Button";
import { LanguageSelector } from "../LanguageSelector";

interface LocationLite {
  id: string;
  name: string;
  account_id: string;
}

// Manager "Kiosks" dashboard: create billable slots, mint 6-digit pairing codes,
// list paired devices, re-pair, and revoke. Slot writes go through the
// service-role /api/pairing endpoint (hard cap + rate limit enforced there);
// reads are client RLS. Mirrors the OfferCMS/StaffManagement shell.
export function KioskManagement() {
  const { user, loading, rolesReady, canManage, canManageLocation, signOut } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedLocation = searchParams.get("location");

  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [slotsPaid, setSlotsPaid] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Route gate: signed in AND able to manage (admin/owner/manager).
  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/login");
    else if (rolesReady && !canManage) navigate("/queue");
  }, [loading, user, rolesReady, canManage, navigate]);

  // Load manageable locations once roles are known.
  useEffect(() => {
    if (!user || !rolesReady) return;
    supabase
      .from("locations")
      .select("id, name, account_id")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          const manageable = ((data as LocationLite[]) ?? []).filter((l) => canManageLocation(l));
          setLocations(manageable);
          const preferred =
            requestedLocation && manageable.some((l) => l.id === requestedLocation)
              ? requestedLocation
              : manageable[0]?.id;
          if (preferred) setLocationId((prev) => prev || preferred);
        }
      });
  }, [user, rolesReady, canManageLocation, requestedLocation]);

  const currentAccount = locations.find((l) => l.id === locationId)?.account_id ?? null;

  const load = useCallback(async (locId: string, accountId: string | null) => {
    setError(null);
    try {
      const [rows, paid] = await Promise.all([
        listSlots(locId),
        accountId ? fetchSlotsPaid(accountId) : Promise.resolve(0),
      ]);
      setSlots(rows);
      setSlotsPaid(paid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load kiosks.");
    }
  }, []);

  useEffect(() => {
    if (locationId) load(locationId, currentAccount);
  }, [locationId, currentAccount, load]);

  const atCap = slots.length >= slotsPaid;

  if (loading || !rolesReady) return <Centered>{t("loading", lang)}</Centered>;
  if (!user || !canManage) return null;

  return (
    <div className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-charcoal">{t("kiosksTitle", lang)}</h1>
            <p className="text-sm text-slate">{user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/manage" className="text-sm font-medium text-sage-dark hover:underline">
              {t("offer", lang)}
            </Link>
            <Link to="/queue" className="text-sm font-medium text-sage-dark hover:underline">
              {t("queueNav", lang)}
            </Link>
            <Link to="/staff" className="text-sm font-medium text-sage-dark hover:underline">
              {t("staffNav", lang)}
            </Link>
            <LanguageSelector />
            <Button variant="ghost" onClick={() => signOut()}>
              {t("signOut", lang)}
            </Button>
          </div>
        </header>

        {error && <p className="mb-4 text-sm text-rose-dark">{error}</p>}

        {locations.length === 0 ? (
          <p className="text-slate">{t("cmsNoLocations", lang)}</p>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <label className="flex max-w-sm flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
                {t("locationLabel", lang)}
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className={inputClass}
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-sm font-medium text-slate">
                {tf("slotUsage", lang, { used: slots.length, paid: slotsPaid })}
              </span>
            </div>

            <AddKioskForm
              locationId={locationId}
              atCap={atCap}
              lang={lang}
              onCreated={() => load(locationId, currentAccount)}
            />

            <section className="mt-8">
              {slots.length === 0 ? (
                <p className="text-slate">{t("noKiosks", lang)}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {slots.map((s) => (
                    <SlotItem
                      key={s.id}
                      slot={s}
                      lang={lang}
                      onChanged={() => load(locationId, currentAccount)}
                    />
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

function AddKioskForm({
  locationId,
  atCap,
  lang,
  onCreated,
}: {
  locationId: string;
  atCap: boolean;
  lang: LangCode;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createSlot(locationId, label);
      setCode({ code: res.code, expiresAt: res.expiresAt });
      setLabel("");
      onCreated();
    } catch (err) {
      setError(pairingError(err, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl bg-white p-6 shadow-soft">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("kioskLabel", lang)}
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("kioskLabelPlaceholder", lang)}
            className={inputClass}
          />
        </label>
        <Button type="submit" disabled={busy || atCap}>
          <Plus size={16} />
          {t("addKiosk", lang)}
        </Button>
      </form>
      {atCap && <p className="mt-3 text-sm text-clay-dark">{t("slotLimitReached", lang)}</p>}
      {error && <p className="mt-3 text-sm text-rose-dark">{error}</p>}
      {code && <PairCodeCard code={code.code} expiresAt={code.expiresAt} lang={lang} />}
    </div>
  );
}

// Prominent one-time display of a freshly minted pairing code.
function PairCodeCard({ code, expiresAt, lang }: { code: string; expiresAt: string; lang: LangCode }) {
  const time = new Date(expiresAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="mt-4 rounded-2xl border border-sage bg-sage-tint/40 p-5 text-center">
      <div className="mb-1 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sage-dark">
        <KeyRound size={14} />
        {t("pairCode", lang)}
      </div>
      <div className="font-mono text-4xl tracking-[0.3em] text-charcoal">{code}</div>
      <p className="mt-2 text-xs text-slate">{t("pairCodeHint", lang)}</p>
      <p className="text-xs text-slate-light">{tf("codeExpires", lang, { time })}</p>
    </div>
  );
}

function SlotItem({ slot, lang, onChanged }: { slot: SlotRow; lang: LangCode; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  async function handleRepair() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await repairSlot(slot.id);
      setCode({ code: res.code, expiresAt: res.expiresAt });
      onChanged();
    } catch (err) {
      setError(pairingError(err, lang));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!confirmRevoke) {
      setConfirmRevoke(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await revokeSlot(slot.id);
      onChanged();
    } catch (err) {
      setError(pairingError(err, lang));
      setBusy(false);
    }
  }

  const lastSeen = slot.lastSeen
    ? new Date(slot.lastSeen).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
    : t("kioskNever", lang);

  return (
    <li className="rounded-2xl bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-40 flex-1">
          <div className="font-medium text-charcoal">{slot.label || t("kioskLabel", lang)}</div>
          <div className="text-xs text-slate-light">{tf("kioskLastSeen", lang, { time: lastSeen })}</div>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
            slot.paired ? "bg-sage-tint text-sage-dark" : "bg-clay-tint text-clay-dark"
          }`}
        >
          {slot.paired ? t("kioskPaired", lang) : t("kioskWaiting", lang)}
        </span>
        <button
          type="button"
          onClick={handleRepair}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sage-dark hover:underline disabled:opacity-50"
        >
          <RefreshCw size={14} />
          {t("rePair", lang)}
        </button>
        <button
          type="button"
          onClick={handleRevoke}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-dark hover:underline disabled:opacity-50"
        >
          <Trash2 size={14} />
          {confirmRevoke ? t("revokeKioskConfirm", lang) : t("revokeKiosk", lang)}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-dark">{error}</p>}
      {code && <PairCodeCard code={code.code} expiresAt={code.expiresAt} lang={lang} />}
    </li>
  );
}

// Maps the endpoint's structured error codes to localized copy.
function pairingError(err: unknown, lang: LangCode): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "slot_limit_reached") return t("slotLimitReached", lang);
  if (msg === "re_pair_too_soon") return t("rePairTooSoon", lang);
  return msg;
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
