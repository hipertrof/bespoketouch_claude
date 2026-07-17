import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Star } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { supabase } from "../../lib/supabase";
import {
  computeByTherapist,
  computeByTreatment,
  computeStats,
  fetchSurveyResponses,
  type SurveyRow,
} from "../../lib/survey";
import { t } from "../../i18n/translations";
import { Button } from "../Button";
import { LanguageSelector } from "../LanguageSelector";
import { SubscriptionBanner } from "../billing/SubscriptionBanner";

// Guest-feedback reporting (/reports). Manager-and-up only — enforced twice:
// this route gates on canManage, and RLS (0013) only returns rows to
// can_manage_location(). The RLS half is the real boundary; the route gate is
// just so a therapist doesn't land on an empty page wondering why.
//
// The therapist-rating column is the sensitive one (therapists must never see
// their own scores). It's safe here because the whole table is manager-only —
// see 0013's header for why that beats column-level grants.

interface LocationLite {
  id: string;
  name: string;
  account_id: string;
}

const RANGES = [
  { days: 7, key: "surveyLast7" },
  { days: 30, key: "surveyLast30" },
  { days: 90, key: "surveyLast90" },
];

export function SurveyReport() {
  const { user, loading, canManage, canManageLocation, rolesReady, signOut } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [locationId, setLocationId] = useState<string>(searchParams.get("location") ?? "");
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<SurveyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (rolesReady && !canManage) navigate("/queue");
  }, [rolesReady, canManage, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("locations")
      .select("id, name, account_id")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          return;
        }
        const all = (data as LocationLite[]) ?? [];
        const mine = all.filter((l) => canManageLocation(l));
        setLocations(mine);
        if (mine.length > 0) setLocationId((prev) => prev || mine[0].id);
      });
  }, [user, canManageLocation]);

  const load = useCallback(async (locId: string, sinceDays: number) => {
    setBusy(true);
    setError(null);
    try {
      setRows(await fetchSurveyResponses(locId, sinceDays));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (locationId) load(locationId, days);
  }, [locationId, days, load]);

  const stats = useMemo(() => computeStats(rows), [rows]);
  const byTherapist = useMemo(() => computeByTherapist(rows), [rows]);
  const byTreatment = useMemo(() => computeByTreatment(rows), [rows]);
  const comments = useMemo(
    () => rows.filter((r) => r.next_visit_note && r.next_visit_note.trim().length > 0).slice(0, 20),
    [rows],
  );

  if (loading || !rolesReady) return <Centered>{t("loading", lang)}</Centered>;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-charcoal">{t("surveyReportTitle", lang)}</h1>
            <p className="text-sm text-slate">{user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/manage" className="text-sm font-medium text-sage-dark hover:underline">
              {t("offer", lang)}
            </Link>
            <Link to="/queue" className="text-sm font-medium text-sage-dark hover:underline">
              {t("queueTitle", lang)}
            </Link>
            <Link to="/staff" className="text-sm font-medium text-sage-dark hover:underline">
              {t("staffNav", lang)}
            </Link>
            <Link to="/kiosks" className="text-sm font-medium text-sage-dark hover:underline">
              {t("kiosksNav", lang)}
            </Link>
            <LanguageSelector />
            <Button variant="ghost" onClick={() => signOut()}>
              {t("signOut", lang)}
            </Button>
          </div>
        </header>

        <SubscriptionBanner />

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
              <div className="inline-flex rounded-full border border-sand bg-white p-1">
                {RANGES.map((r) => (
                  <button
                    key={r.days}
                    type="button"
                    onClick={() => setDays(r.days)}
                    className={`min-h-9 rounded-full px-4 text-sm font-semibold transition-all ${
                      days === r.days ? "bg-clay text-white" : "text-slate hover:bg-oatmeal"
                    }`}
                  >
                    {t(r.key, lang)}
                  </button>
                ))}
              </div>
            </div>

            {busy ? (
              <p className="text-slate">{t("loading", lang)}</p>
            ) : rows.length === 0 ? (
              <p className="rounded-2xl bg-white p-8 text-center text-slate shadow-soft">
                {t("surveyNoData", lang)}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label={t("surveyResponses", lang)} value={String(stats.count)} />
                  <Stat
                    label={t("surveyCsat", lang)}
                    value={stats.csatAvg !== null ? `${stats.csatAvg.toFixed(1)} / 5` : "—"}
                  />
                  <Stat
                    label={t("surveyNpsLabel", lang)}
                    value={stats.npsScore !== null ? String(stats.npsScore) : "—"}
                  />
                  <Stat
                    label={t("surveyPressureMismatch", lang)}
                    value={pct(stats.pressureMismatchRate)}
                  />
                </div>

                <Section title={t("surveyByTherapist", lang)} note={t("surveyManagersOnly", lang)}>
                  {byTherapist.length === 0 ? (
                    <Empty lang={lang} />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {byTherapist.map((tp) => (
                        <li
                          key={tp.therapistId ?? tp.name}
                          className="flex flex-wrap items-center gap-3 rounded-xl bg-oatmeal px-4 py-3"
                        >
                          <span className="min-w-0 flex-1 truncate font-medium text-charcoal">
                            {tp.name}
                          </span>
                          <span className="text-xs text-slate-light">
                            {tp.count} × {t("surveyResponses", lang).toLowerCase()}
                          </span>
                          <span className="inline-flex items-center gap-1 text-sm text-charcoal">
                            <Star size={14} className="text-clay" fill="currentColor" />
                            {tp.csatAvg !== null ? tp.csatAvg.toFixed(1) : "—"}
                          </span>
                          <span className="text-sm text-slate">
                            {t("surveyResponsive", lang)}: {pct(tp.responsiveYesRate)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title={t("surveyByTreatment", lang)}>
                  {byTreatment.length === 0 ? (
                    <Empty lang={lang} />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {byTreatment.map((tr) => (
                        <li
                          key={tr.name}
                          className="flex flex-wrap items-center gap-3 rounded-xl bg-oatmeal px-4 py-3"
                        >
                          <span className="min-w-0 flex-1 truncate font-medium text-charcoal">
                            {tr.name}
                          </span>
                          <span className="text-xs text-slate-light">{tr.count}</span>
                          <span className="inline-flex items-center gap-1 text-sm text-charcoal">
                            <Star size={14} className="text-clay" fill="currentColor" />
                            {tr.csatAvg !== null ? tr.csatAvg.toFixed(1) : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title={t("surveyComments", lang)}>
                  {comments.length === 0 ? (
                    <Empty lang={lang} />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {comments.map((c) => (
                        <li key={c.id} className="rounded-xl bg-oatmeal px-4 py-3">
                          <p className="text-sm text-charcoal">{c.next_visit_note}</p>
                          <p className="mt-1 text-xs text-slate-light">
                            {new Date(c.created_at).toLocaleDateString()}
                            {c.therapist_name ? ` · ${c.therapist_name}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-light">{label}</div>
      <div className="mt-1 font-serif text-2xl text-charcoal">{value}</div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-1 font-serif text-xl text-charcoal">{title}</h2>
      {note && <p className="mb-3 text-xs text-slate-light">{note}</p>}
      <div className={note ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Empty({ lang }: { lang: Parameters<typeof t>[1] }) {
  return <p className="text-sm text-slate-light">{t("surveyNoData", lang)}</p>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6 text-slate">
      {children}
    </div>
  );
}

function pct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}
