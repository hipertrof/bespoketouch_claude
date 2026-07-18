import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RotateCcw, RefreshCw, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { supabase } from "../../lib/supabase";
import { fetchIntakes, updateIntakeStatus, type IntakeRow } from "../../lib/intakes";
import { t, type LangCode } from "../../i18n/translations";
import type { PartySize } from "../../types";
import { guestDisplayName } from "../../utils/guestName";
import { Button } from "../Button";
import { LanguageSelector } from "../LanguageSelector";
import { IntakePanel, type IntakePanelView } from "../IntakePanel";

interface LocationLite {
  id: string;
  name: string;
}

const pickName = (dict: Record<string, string> | null, lang: LangCode): string =>
  dict?.[lang] ?? dict?.pl ?? Object.values(dict ?? {})[0] ?? "";

// Maps a persisted intake into the source-agnostic view the IntakePanel renders.
// separateTreatments isn't stored — infer it from the two picks differing (it
// only drives the couple "different treatments" badge).
function toView(row: IntakeRow): IntakePanelView {
  const partySize: PartySize = row.party_size === 2 ? 2 : 1;
  const separateTreatments =
    partySize === 2 &&
    row.treatment_selections[0]?.treatmentId !== row.treatment_selections[1]?.treatmentId;
  return {
    partySize,
    separateTreatments,
    guestNames: row.guest_names ?? [],
    guests: row.personalizations ?? [],
    treatments: row.treatment_selections ?? [],
  };
}

// Therapist queue: locked intakes for a location, newest first. Reuses the
// shared IntakePanel to show a selected visit. Access is RLS-gated to locations
// the signed-in user (therapist / manager / owner) belongs to. UI language is
// the global staff language.
export function TherapistQueue() {
  const { user, loading, canManage, signOut } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [intakes, setIntakes] = useState<IntakeRow[]>([]);
  const [selected, setSelected] = useState<IntakeRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("locations")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setLocations((data as LocationLite[]) ?? []);
          if (data && data.length > 0) setLocationId((prev) => prev || data[0].id);
        }
      });
  }, [user]);

  // Latest-wins: only the most recent load may apply its result, so switching
  // the location selector while a fetch is in flight can't leave the previous
  // location's intakes (guest names, health-relevant notes) rendered under the
  // new location's name — or let a therapist mark the wrong location's visit done.
  const loadReqRef = useRef(0);
  const loadIntakes = useCallback(async (locId: string) => {
    const reqId = ++loadReqRef.current;
    setError(null);
    setBusy(true);
    try {
      const rows = await fetchIntakes(locId);
      if (loadReqRef.current === reqId) setIntakes(rows);
    } catch (e) {
      if (loadReqRef.current === reqId) setError(e instanceof Error ? e.message : t("queueError", "en"));
    } finally {
      if (loadReqRef.current === reqId) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (locationId) loadIntakes(locationId);
  }, [locationId, loadIntakes]);

  async function setStatus(row: IntakeRow, status: string) {
    try {
      await updateIntakeStatus(row.id, status);
      setIntakes((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
      setSelected((prev) => (prev && prev.id === row.id ? { ...prev, status } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("queueError", lang));
    }
  }

  if (loading) return <Centered>{t("loading", lang)}</Centered>;
  if (!user) return null;

  // Detail view: the selected intake, rendered by the shared panel.
  if (selected) {
    const done = selected.status === "done";
    return (
      <div className="min-h-screen bg-cream">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-6 sm:px-6 lg:px-8">
          <Button variant="ghost" onClick={() => setSelected(null)}>
            <ArrowLeft size={18} />
            {t("queueBack", lang)}
          </Button>
          <LanguageSelector />
        </div>
        <IntakePanel
          view={toView(selected)}
          initialLang={lang}
          actions={(l) => (
            <Button
              variant={done ? "ghost" : "secondary"}
              className="w-full sm:w-auto"
              onClick={() => setStatus(selected, done ? "submitted" : "done")}
            >
              {done ? <RotateCcw size={18} /> : <CheckCircle2 size={18} />}
              {done ? t("queueReopen", l) : t("queueMarkDone", l)}
            </Button>
          )}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-charcoal">{t("queueTitle", lang)}</h1>
            <p className="text-sm text-slate">{user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            {canManage && (
              <>
                <Link to="/manage" className="text-sm font-medium text-sage-dark hover:underline">
                  {t("offer", lang)}
                </Link>
                <Link to="/staff" className="text-sm font-medium text-sage-dark hover:underline">
                  {t("staffNav", lang)}
                </Link>
                <Link to="/kiosks" className="text-sm font-medium text-sage-dark hover:underline">
                  {t("kiosksNav", lang)}
                </Link>
                <Link to="/reports" className="text-sm font-medium text-sage-dark hover:underline">
                  {t("surveyNav", lang)}
                </Link>
              </>
            )}
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
              <Button variant="ghost" onClick={() => locationId && loadIntakes(locationId)} disabled={busy}>
                <RefreshCw size={16} />
                {t("queueRefresh", lang)}
              </Button>
            </div>

            {intakes.length === 0 ? (
              <p className="rounded-2xl bg-white p-8 text-center text-slate shadow-soft">
                {t("queueEmpty", lang)}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {intakes.map((row) => (
                  <IntakeRowCard
                    key={row.id}
                    row={row}
                    lang={lang}
                    onOpen={() => setSelected(row)}
                    onToggleDone={() =>
                      setStatus(row, row.status === "done" ? "submitted" : "done")
                    }
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function IntakeRowCard({
  row,
  lang,
  onOpen,
  onToggleDone,
}: {
  row: IntakeRow;
  lang: LangCode;
  onOpen: () => void;
  onToggleDone: () => void;
}) {
  const partySize: PartySize = row.party_size === 2 ? 2 : 1;
  const first = row.treatment_selections?.[0];
  const treatmentName = first ? pickName(first.nameI18n, lang) : "—";
  // Assigned therapist names (deduped — a couple often shares one therapist).
  const therapistNames = [
    ...new Set((row.therapists ?? []).flatMap((tp) => (tp ? [tp.name] : []))),
  ].join(", ");
  const done = row.status === "done";
  const time = new Date(row.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className={`flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-soft ${done ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-semibold text-charcoal">
            {guestDisplayName(row.guest_names ?? [], partySize)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
              done ? "bg-sage-tint text-sage-dark" : "bg-clay-tint text-clay-dark"
            }`}
          >
            {done ? t("queueStatusDone", lang) : t("queueStatusSubmitted", lang)}
          </span>
        </div>
        <div className="mt-0.5 truncate text-sm text-slate-light">
          {treatmentName}
          {first?.minutes ? ` · ${first.minutes} min` : ""} · {time}
          {therapistNames ? ` · ${therapistNames}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleDone}
          className="text-sm font-medium text-sage-dark hover:underline"
        >
          {done ? t("queueReopen", lang) : t("queueMarkDone", lang)}
        </button>
        <Button variant="secondary" onClick={onOpen}>
          {t("queueOpen", lang)}
        </Button>
      </div>
    </li>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6 text-slate">
      {children}
    </div>
  );
}
