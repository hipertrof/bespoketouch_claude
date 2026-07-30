import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Copy, Plus, RefreshCw, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { supabase } from "../../lib/supabase";
import {
  convertPrevisitVisit,
  createPrevisitLink,
  listPrevisitVisits,
  previsitLinkUrl,
  revokePrevisitVisit,
  type PrevisitRow,
  type PrevisitState,
} from "../../lib/previsit";
import { t, type LangCode } from "../../i18n/translations";
import { Button } from "../Button";
import { DashboardShell } from "../DashboardShell";
import { VisitFieldsForm, useVisitFields } from "../queue/VisitFieldsForm";

interface LocationLite {
  id: string;
  name: string;
  account_id: string;
}

const pickName = (dict: Record<string, string> | null, lang: LangCode): string =>
  dict?.[lang] ?? dict?.pl ?? Object.values(dict ?? {})[0] ?? "";

const STATE_LABEL: Record<PrevisitState, string> = {
  created: "previsitStateCreated",
  filled: "previsitStateFilled",
  arrived: "previsitStateArrived",
  expired: "previsitStateExpired",
  revoked: "previsitStateRevoked",
};

const STATE_CHIP: Record<PrevisitState, string> = {
  created: "bg-clay-tint text-clay-dark",
  filled: "bg-sage-tint text-sage-dark",
  arrived: "bg-sage-tint text-sage-dark",
  expired: "bg-sand text-slate",
  revoked: "bg-rose-tint text-rose-dark",
};

// Planned visits and their pre-visit intake links.
//
// Reception creates a visit here with the same fields it would type on the
// kiosk's first two steps, sends the guest the link through whatever channel the
// spa already uses (we only produce the URL — nothing sends), and clicks "guest
// arrived" when they walk in, which turns the record into a normal intake in
// /queue.
//
// Front desk and up, matching /api/previsit's own gate. A therapist is
// redirected: hiding the nav link is not access control.
export function PrevisitDashboard() {
  const { user, loading, rolesReady, canManage, memberships, canAccessLocation } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const isFrontDesk = memberships.some((m) => m.role === "frontdesk");
  const allowed = canManage || isFrontDesk;

  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [locationId, setLocationId] = useState("");
  const [rows, setRows] = useState<PrevisitRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && rolesReady && user && !allowed) navigate("/queue");
  }, [loading, rolesReady, user, allowed, navigate]);

  useEffect(() => {
    if (!user || !rolesReady) return;
    supabase
      .from("locations")
      .select("id, name, account_id")
      .order("name", { ascending: true })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else {
          const accessible = ((data as LocationLite[]) ?? []).filter((l) => canAccessLocation(l));
          setLocations(accessible);
          if (accessible.length > 0) setLocationId((prev) => prev || accessible[0].id);
        }
      });
  }, [user, rolesReady, canAccessLocation]);

  const location = locations.find((l) => l.id === locationId) ?? null;
  const accountId = location?.account_id ?? "";

  // Latest-wins, like TherapistQueue: switching location mid-fetch must not
  // leave the previous location's guest names rendered under the new one.
  const loadReqRef = useRef(0);
  const load = useCallback(async (acct: string, locId: string) => {
    const reqId = ++loadReqRef.current;
    setError(null);
    setBusy(true);
    try {
      const list = await listPrevisitVisits(acct, locId);
      if (loadReqRef.current === reqId) setRows(list);
    } catch (e) {
      if (loadReqRef.current === reqId) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (loadReqRef.current === reqId) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (accountId && locationId) load(accountId, locationId);
  }, [accountId, locationId, load]);

  const handleConvert = async (row: PrevisitRow) => {
    try {
      await convertPrevisitVisit(accountId, row.id);
      navigate("/queue");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRevoke = async (row: PrevisitRow) => {
    setConfirmRevoke(null);
    try {
      await revokePrevisitVisit(accountId, row.id);
      await load(accountId, locationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) return <Centered>{t("loading", lang)}</Centered>;
  if (!user || !allowed) return null;

  return (
    <DashboardShell title={t("upcomingTitle", lang)} subtitle={t("upcomingSubtitle", lang)}>
      {/* Dismissible, never an early return: a failed revoke must not replace
          the whole list. */}
      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-rose-tint p-3 text-sm text-rose-dark">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label={t("close", lang)}>
            <X size={16} />
          </button>
        </div>
      )}

      {locations.length === 0 ? (
        <p className="text-slate">{t("cmsNoLocations", lang)}</p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-3">
            <label className="flex max-w-sm flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
              {t("locationLabel", lang)}
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="min-h-11 rounded-xl border border-sand bg-cream px-3 text-charcoal outline-none focus:border-sage"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="ghost" onClick={() => accountId && load(accountId, locationId)} disabled={busy}>
              <RefreshCw size={16} />
              {t("queueRefresh", lang)}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} />
              {t("upcomingNew", lang)}
            </Button>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-2xl bg-white p-8 text-center text-slate shadow-soft">
              {t("upcomingEmpty", lang)}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((row) => (
                <PrevisitRowCard
                  key={row.id}
                  row={row}
                  lang={lang}
                  confirming={confirmRevoke === row.id}
                  onConfirmRevoke={() => setConfirmRevoke(row.id)}
                  onCancelRevoke={() => setConfirmRevoke(null)}
                  onRevoke={() => handleRevoke(row)}
                  onConvert={() => handleConvert(row)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {creating && location && (
        <PrevisitCreateModal
          accountId={accountId}
          locationId={location.id}
          onClose={() => setCreating(false)}
          onCreated={(code) => {
            setCreating(false);
            setFreshLink(previsitLinkUrl(code));
            load(accountId, locationId);
          }}
        />
      )}

      {freshLink && <PrevisitLinkModal url={freshLink} onClose={() => setFreshLink(null)} />}
    </DashboardShell>
  );
}

function PrevisitRowCard({
  row,
  lang,
  confirming,
  onConfirmRevoke,
  onCancelRevoke,
  onRevoke,
  onConvert,
}: {
  row: PrevisitRow;
  lang: LangCode;
  confirming: boolean;
  onConfirmRevoke: () => void;
  onCancelRevoke: () => void;
  onRevoke: () => void;
  onConvert: () => void;
}) {
  const first = row.treatmentSelections?.[0];
  const treatmentName = first?.treatmentId ? pickName(first.nameI18n, lang) : "—";
  const therapistName = row.therapists?.[0]?.name ?? "";
  const roomName = row.roomAssignments?.[0]?.roomName ?? "";
  const dormant = row.state === "arrived" || row.state === "expired" || row.state === "revoked";
  const expires = new Date(row.expiresAt).toLocaleDateString();

  return (
    <li className={`flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-soft ${dormant ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-semibold text-charcoal">{row.guestName}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${STATE_CHIP[row.state]}`}
          >
            {t(STATE_LABEL[row.state], lang)}
          </span>
        </div>
        <div className="mt-0.5 truncate text-sm text-slate-light">
          {treatmentName}
          {first?.minutes ? ` · ${first.minutes} min` : ""}
          {therapistName ? ` · ${therapistName}` : ""}
          {roomName ? ` · ${roomName}` : ""}
          {" · "}
          {t("previsitExpiresLabel", lang)} {expires}
          {` · ${row.createdByName}`}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!dormant &&
          (confirming ? (
            <>
              <button type="button" onClick={onRevoke} className="text-sm font-semibold text-rose-dark hover:underline">
                {t("previsitRevokeConfirm", lang)}
              </button>
              <button type="button" onClick={onCancelRevoke} className="text-sm font-medium text-slate-light hover:underline">
                {t("cancel", lang)}
              </button>
            </>
          ) : (
            <button type="button" onClick={onConfirmRevoke} className="text-sm font-medium text-slate-light hover:underline">
              {t("previsitRevoke", lang)}
            </button>
          ))}
        {row.state !== "arrived" && row.state !== "revoked" && (
          <Button variant="secondary" onClick={onConvert}>
            {t("previsitMarkArrived", lang)}
          </Button>
        )}
      </div>
    </li>
  );
}

function PrevisitCreateModal({
  accountId,
  locationId,
  onClose,
  onCreated,
}: {
  accountId: string;
  locationId: string;
  onClose: () => void;
  onCreated: (code: string) => void;
}) {
  const { lang } = useLanguage();
  const fields = useVisitFields(locationId);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The phone is the second half of the guest's credential, so it is required
  // here even though it is optional on a walk-in intake.
  const phoneValid = phone.replace(/\D/g, "").length >= 6;

  const handleCreate = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const built = fields.buildFields();
      const { code } = await createPrevisitLink({
        accountId,
        locationId,
        phone,
        guestName: built.guestNames[0],
        treatmentSelections: built.treatmentSelections,
        therapists: built.therapists,
        roomAssignments: built.roomAssignments,
      });
      onCreated(code);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const error = saveError ?? fields.loadError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/70 p-4">
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-soft sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close", lang)}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-slate-light hover:bg-oatmeal"
        >
          <X size={20} />
        </button>

        <h2 className="mb-6 font-serif text-2xl text-charcoal">{t("previsitCreateTitle", lang)}</h2>

        {error && <p className="mb-4 text-sm text-rose-dark">{error}</p>}

        <div className="mb-4">
          <label htmlFor="previsitPhone" className="mb-1.5 block text-sm font-semibold text-charcoal">
            {t("previsitPhoneLabel", lang)}
          </label>
          <input
            id="previsitPhone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("guestPhonePlaceholder", lang)}
            className="min-h-11 w-full rounded-xl border border-sand bg-white px-3 text-base text-charcoal outline-none focus:border-clay focus:ring-4 focus:ring-clay/15"
          />
        </div>

        <VisitFieldsForm fields={fields} idPrefix="previsit" />

        <Button
          onClick={handleCreate}
          disabled={!fields.canSave || !phoneValid || saving}
          className="mt-6 w-full"
        >
          {t("previsitCreateSubmit", lang)}
        </Button>
      </div>
    </div>
  );
}

// The link is shown ONCE: the server stores only its hash, so there is no way to
// retrieve it afterwards. Modelled on /staff's invite link, which works the same
// way for the same reason.
function PrevisitLinkModal({ url, onClose }: { url: string; onClose: () => void }) {
  const { lang } = useLanguage();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // clipboard blocked — the link is still visible to copy manually
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/70 p-4">
      <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-soft sm:p-8">
        <h2 className="mb-2 font-serif text-2xl text-charcoal">{t("previsitLinkTitle", lang)}</h2>
        <p className="mb-4 text-sm leading-relaxed text-rose-dark">{t("previsitLinkOnceWarning", lang)}</p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            className="min-h-11 flex-1 rounded-xl border border-sand bg-oatmeal px-3 text-xs text-charcoal outline-none"
          />
          <Button type="button" variant="secondary" onClick={copy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? t("previsitLinkCopied", lang) : t("previsitLinkCopy", lang)}
          </Button>
        </div>
        <Button onClick={onClose} className="mt-6 w-full">
          {t("close", lang)}
        </Button>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6 text-slate">{children}</div>
  );
}
