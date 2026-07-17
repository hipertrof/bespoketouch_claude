import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Star } from "lucide-react";
import { useDevice } from "../../context/DeviceContext";
import { languages, t, type LangCode } from "../../i18n/translations";
import {
  fetchSurveySessions,
  submitSurvey,
  type Comfort,
  type PressureFeedback,
  type SurveyAnswers,
  type SurveySession,
} from "../../lib/survey";
import { Button } from "../Button";
import { SegmentedControl } from "../SegmentedControl";

// Post-treatment survey — a separate kiosk mode from the intake flow, reached
// from WelcomeStep at checkout. Deliberately NOT wired into GuestContext: the
// intake session ended 30–90 minutes ago, and entangling the two reducers would
// mean a survey could resurrect or corrupt a half-finished check-in.
//
// Shape of the interaction: front-desk picks the guest's visit (which attaches
// therapist + treatment pseudonymously), hands the tablet over and steps away,
// the guest answers in their own language, then it resets for the next guest.
//
// Every question is skippable — that's a deliberate bias mitigation for the
// on-kiosk timing, not an oversight. `null` is a real answer here.

type Phase = "pick" | "handoff" | "questions" | "thanks";

const emptyAnswers: SurveyAnswers = {
  pressureFeedback: null,
  atmosphereComfort: null,
  therapistResponsiveness: null,
  csatStars: null,
  nps: null,
  nextVisitNote: "",
};

export function SurveyScreen() {
  const { token } = useDevice();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("pick");
  const [lang, setLang] = useState<LangCode>("pl");
  const [sessions, setSessions] = useState<SurveySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SurveySession | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswers>(emptyAnswers);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No token (the bundled ?demo run) — there are no visits to fetch and the
    // submit would 401 anyway. Settle into the empty state instead of spinning.
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchSurveySessions(token)
      .then((rows) => !cancelled && setSessions(rows))
      .catch((err) => {
        console.warn("[survey] could not load today's visits:", err);
        if (!cancelled) setSessions([]);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Back to a clean slate for the next guest, without a reload.
  const reset = useCallback(() => {
    setPhase("pick");
    setSelected(null);
    setAnswers(emptyAnswers);
    setLang("pl");
    setError(null);
  }, []);

  async function send() {
    // Unpaired (?demo): surface the failure rather than no-op on a tap.
    if (!token) {
      setError("unpaired");
      return;
    }
    setSending(true);
    setError(null);
    const therapist = selected?.therapists?.find((x) => x) ?? null;
    try {
      await submitSurvey({
        deviceToken: token,
        intakeId: selected?.id ?? null,
        therapistId: therapist?.id ?? null,
        therapistName: therapist?.name ?? null,
        treatmentName: treatmentLabel(selected, "pl") || null,
        lang,
        answers,
      });
      setPhase("thanks");
    } catch (err) {
      console.error("[survey] submit failed:", err);
      setError(err instanceof Error ? err.message : t("surveyFailed", lang));
    } finally {
      setSending(false);
    }
  }

  if (phase === "pick") {
    return (
      <Shell>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-sage-dark hover:underline"
        >
          <ArrowLeft size={16} />
          {t("surveyBackToKiosk", "pl")}
        </button>
        <h1 className="font-serif text-3xl text-charcoal">{t("surveyPickVisit", "pl")}</h1>
        <p className="mt-2 text-sm text-slate">{t("surveyPickVisitHint", "pl")}</p>

        {loading ? (
          <p className="mt-8 text-slate">…</p>
        ) : sessions.length === 0 ? (
          <p className="mt-8 rounded-2xl bg-white p-6 text-center text-slate shadow-soft">
            {t("surveyNoVisits", "pl")}
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(s);
                    setPhase("handoff");
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-soft transition-all hover:shadow-md active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-charcoal">
                      {s.guestNames.filter(Boolean).join(" & ") || "—"}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-slate-light">
                      {treatmentLabel(s, "pl")}
                      {therapistLabel(s) ? ` · ${therapistLabel(s)}` : ""} · {timeOf(s.createdAt)}
                    </div>
                  </div>
                  <ArrowRight size={18} className="shrink-0 text-slate-light" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setPhase("handoff");
          }}
          className="mt-6 text-sm font-medium text-slate hover:underline"
        >
          {t("surveySkipLink", "pl")}
        </button>
      </Shell>
    );
  }

  // Front-desk hands over here. The guest picks their language first, so every
  // question that follows is in their own words.
  if (phase === "handoff") {
    return (
      <Shell>
        <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
          <h1 className="font-serif text-3xl text-charcoal">{t("surveyHandToGuest", "pl")}</h1>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {languages.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => {
                  setLang(l.code);
                  setPhase("questions");
                }}
                className="min-h-12 rounded-xl border border-sand bg-white px-5 text-sm font-semibold text-charcoal transition-all hover:border-clay/40 hover:bg-oatmeal/60 active:scale-[0.98]"
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPhase("pick")}
            className="mt-10 text-sm font-medium text-slate hover:underline"
          >
            {t("surveyBackToKiosk", "pl")}
          </button>
        </div>
      </Shell>
    );
  }

  if (phase === "thanks") {
    return (
      <Shell>
        <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-sage-tint text-sage-dark">
            <CheckCircle2 size={40} strokeWidth={1.5} />
          </div>
          <h1 className="font-serif text-3xl text-charcoal">{t("surveyThanks", lang)}</h1>
          <p className="mt-3 text-slate">{t("surveyThanksBody", lang)}</p>
          <Button variant="secondary" onClick={reset} className="mt-12">
            {t("surveyStart", "pl")}
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-light">
        {t("surveySectionSession", lang)}
      </p>
      <h1 className="mt-1 font-serif text-2xl text-charcoal">{t("surveyIntroTitle", lang)}</h1>
      <p className="mt-2 text-sm text-slate">{t("surveyPrivate", lang)}</p>

      <div className="mt-8 flex flex-col gap-6">
        <Question label={t("surveyQPressure", lang)}>
          <SegmentedControl<PressureFeedback>
            options={[
              { value: "too_light", label: t("surveyPressureLight", lang) },
              { value: "just_right", label: t("surveyPressureRight", lang) },
              { value: "too_deep", label: t("surveyPressureDeep", lang) },
            ]}
            value={answers.pressureFeedback as PressureFeedback}
            onChange={(v) => setAnswers((a) => ({ ...a, pressureFeedback: v }))}
          />
        </Question>

        <Question label={t("surveyQAtmosphere", lang)}>
          <ComfortControl
            lang={lang}
            value={answers.atmosphereComfort}
            onChange={(v) => setAnswers((a) => ({ ...a, atmosphereComfort: v }))}
          />
        </Question>

        <Question label={t("surveyQTherapist", lang)}>
          <ComfortControl
            lang={lang}
            value={answers.therapistResponsiveness}
            onChange={(v) => setAnswers((a) => ({ ...a, therapistResponsiveness: v }))}
          />
        </Question>

        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-light">
          {t("surveySectionOverall", lang)}
        </p>

        <Question label={t("surveyQCsat", lang)}>
          <Stars value={answers.csatStars} onChange={(v) => setAnswers((a) => ({ ...a, csatStars: v }))} />
        </Question>

        <Question label={t("surveyQNps", lang)}>
          <NpsScale lang={lang} value={answers.nps} onChange={(v) => setAnswers((a) => ({ ...a, nps: v }))} />
        </Question>

        <Question label={t("surveyQNote", lang)}>
          <textarea
            value={answers.nextVisitNote}
            onChange={(e) => setAnswers((a) => ({ ...a, nextVisitNote: e.target.value }))}
            placeholder={t("surveyNotePlaceholder", lang)}
            rows={3}
            className="w-full rounded-xl border border-sand bg-white p-3 text-charcoal outline-none focus:border-sage"
          />
        </Question>
      </div>

      {/* Guests see the plain sentence; the technical reason is kept alongside
          it in muted text so front-desk (and a future me) can tell "not paired"
          apart from a server fault without opening a console on a tablet. */}
      {error && (
        <div className="mt-6">
          <p className="text-sm text-rose-dark">{t("surveyFailed", lang)}</p>
          <p className="mt-1 text-xs text-slate-light">{error}</p>
        </div>
      )}

      <Button onClick={send} disabled={sending} className="mt-8 w-full">
        {sending ? t("surveySubmitting", lang) : t("surveySubmit", lang)}
      </Button>
    </Shell>
  );
}

// ---------------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-xl">{children}</div>
    </div>
  );
}

function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-soft">
      <p className="mb-3 text-base font-medium text-charcoal">{label}</p>
      {children}
    </div>
  );
}

function ComfortControl({
  lang,
  value,
  onChange,
}: {
  lang: LangCode;
  value: Comfort | null;
  onChange: (v: Comfort) => void;
}) {
  return (
    <SegmentedControl<Comfort>
      options={[
        { value: "yes", label: t("surveyComfortYes", lang) },
        { value: "mostly", label: t("surveyComfortMostly", lang) },
        { value: "no", label: t("surveyComfortNo", lang) },
      ]}
      value={value as Comfort}
      onChange={onChange}
    />
  );
}

function Stars({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value !== null && n <= value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n}`}
            className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-all active:scale-[0.98] ${
              on ? "border-clay bg-clay-tint text-clay-dark" : "border-sand bg-white text-slate-light"
            }`}
          >
            <Star size={22} fill={on ? "currentColor" : "none"} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}

function NpsScale({
  lang,
  value,
  onChange,
}: {
  lang: LangCode;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-11 min-w-11 flex-1 rounded-lg border text-sm font-semibold transition-all active:scale-[0.98] ${
              value === n
                ? "border-clay bg-clay-tint text-clay-dark"
                : "border-sand bg-white text-slate hover:border-clay/40"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-light">
        <span>{t("surveyNpsLow", lang)}</span>
        <span>{t("surveyNpsHigh", lang)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function treatmentLabel(s: SurveySession | null, lang: string): string {
  const dict = s?.treatments?.[0]?.nameI18n;
  if (!dict) return "";
  return dict[lang] ?? dict.pl ?? Object.values(dict)[0] ?? "";
}

function therapistLabel(s: SurveySession): string {
  return [...new Set((s.therapists ?? []).flatMap((x) => (x ? [x.name] : [])))].join(", ");
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
