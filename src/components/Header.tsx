import { Globe } from "lucide-react";
import { Logo } from "./Logo";
import { StepIndicator } from "./StepIndicator";
import { useGuest } from "../context/GuestContext";
import { languages, t } from "../i18n/translations";
import type { AppStep, LangCode } from "../types";

function LanguageSelect() {
  const { state, dispatch } = useGuest();
  return (
    <label className="relative flex items-center gap-1.5 rounded-full border border-sand bg-white px-3 py-1.5 shadow-soft">
      <Globe size={15} className="shrink-0 text-slate-light" />
      <span className="sr-only">{t("language", state.language)}</span>
      <select
        value={state.language}
        onChange={(e) => dispatch({ type: "SET_LANGUAGE", language: e.target.value as LangCode })}
        className="cursor-pointer appearance-none bg-transparent pr-4 text-sm font-semibold text-charcoal outline-none"
        aria-label={t("language", state.language)}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-3 h-2.5 w-2.5 text-slate-light"
      >
        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    </label>
  );
}

export function Header({ step }: { step: AppStep }) {
  const { state } = useGuest();
  const showProgress = ["welcome", "staffHandoff", "bodyMap", "preferences", "handoff"].includes(
    step,
  );

  return (
    <header className="sticky top-0 z-40 border-b border-sand/70 bg-cream/90 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4 sm:h-24 sm:px-6 lg:px-8">
        <Logo compact={step === "masseur"} lang={state.language} />
        {showProgress && <StepIndicator current={step} lang={state.language} />}
        <div className="flex items-center gap-3">
          {step === "masseur" && (
            <span className="rounded-full bg-sage-tint px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sage-dark">
              {t("therapistPanel", state.language)}
            </span>
          )}
          {/* The dashboard owns its own language control, so hide the global one there. */}
          {step !== "masseur" && <LanguageSelect />}
        </div>
      </div>
    </header>
  );
}
