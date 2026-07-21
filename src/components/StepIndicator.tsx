import { Check } from "lucide-react";
import { t } from "../i18n/translations";
import type { AppStep, LangCode } from "../types";

const STEPS: { step: AppStep; labelKey: string }[] = [
  { step: "welcome", labelKey: "stepWelcome" },
  { step: "bodyMap", labelKey: "stepBodyMap" },
  { step: "preferences", labelKey: "stepPreferences" },
  { step: "handoff", labelKey: "stepSummary" },
];

// staffHandoff is a brief interstitial before the guest begins Krok 1's tasks,
// so it renders as part of "Powitanie" rather than its own step. guestHandoff
// (between the two people of a couple's treatment) leads back into the body
// map, so it renders as part of "Mapa ciała".
const normalizeStep = (step: AppStep): AppStep => {
  if (step === "treatment") return "welcome";
  if (step === "staffHandoff") return "welcome";
  if (step === "guestHandoff") return "bodyMap";
  return step;
};

export function StepIndicator({ current, lang = "pl" }: { current: AppStep; lang?: LangCode }) {
  const currentIndex = STEPS.findIndex((s) => s.step === normalizeStep(current));
  if (currentIndex === -1) return null;

  return (
    <ol className="flex items-center gap-1 sm:gap-1.5">
      {STEPS.map((s, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <li key={s.step} className="flex items-center gap-1 sm:gap-1.5">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300 sm:h-7 sm:w-7 ${
                isDone
                  ? "bg-sage-dark text-cream"
                  : isCurrent
                    ? "bg-sage text-cream"
                    : "bg-oatmeal-dark text-slate-light"
              }`}
              aria-current={isCurrent ? "step" : undefined}
            >
              {isDone ? <Check size={13} strokeWidth={2.5} /> : i + 1}
            </div>
            {/* Only the current step shows its label — keeps the row on one
                line regardless of how long the words get in any language. */}
            {isCurrent && (
              <span className="hidden whitespace-nowrap text-sm font-medium text-charcoal sm:inline">
                {t(s.labelKey, lang)}
              </span>
            )}
            {i < STEPS.length - 1 && (
              <span className="h-px w-3 bg-sand sm:w-5 lg:ml-1 lg:w-8" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
