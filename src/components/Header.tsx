import { Logo } from "./Logo";
import { StepIndicator } from "./StepIndicator";
import type { AppStep } from "../types";

export function Header({ step }: { step: AppStep }) {
  const showProgress = ["welcome", "staffHandoff", "bodyMap", "preferences", "handoff"].includes(
    step,
  );

  return (
    <header className="sticky top-0 z-40 border-b border-sand/70 bg-cream/90 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4 sm:h-24 sm:px-6 lg:px-8">
        <Logo compact={step === "masseur"} />
        {showProgress && <StepIndicator current={step} />}
        {step === "masseur" && (
          <span className="rounded-full bg-sage-tint px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sage-dark">
            Panel Masażysty
          </span>
        )}
      </div>
    </header>
  );
}
