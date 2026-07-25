import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { useCatalog } from "../../context/CatalogContext";
import { toMassageTypes } from "../../lib/catalog";
import {
  allDurationsForPartySize,
  availableDurations,
  durationPrice,
  formatPrice,
  isAvailableForPartySize,
} from "../../data/massageTypes";
import { t } from "../../i18n/translations";
import { Button } from "../Button";
import type { MassageType } from "../../types";

// Second half of the kiosk check-in: duration + treatment selection, split out
// of WelcomeStep so the guest-details screen and the treatment menu are two
// calmer steps instead of one long scroll. Party size / names / therapists are
// already set on the previous step; this step only touches treatmentSelections.
export function TreatmentStep() {
  const { state, dispatch } = useGuest();
  const { catalog } = useCatalog();
  const lang = state.language;
  // The offer, mapped to the session language (names already translated).
  const massages = useMemo(() => toMassageTypes(catalog, lang), [catalog, lang]);
  const isCouple = state.partySize === 2;
  const showPersonTabs = isCouple && state.separateTreatments;

  const [editingGuestIndex, setEditingGuestIndex] = useState(0);
  useEffect(() => {
    if (!showPersonTabs) setEditingGuestIndex(0);
  }, [showPersonTabs]);

  const currentSelection = state.treatmentSelections[editingGuestIndex];
  const selectedId = currentSelection?.treatmentId ?? null;
  // Duration is always the same for every guest (see reducer), so any entry
  // reflects the party's shared value.
  const currentMinutes = state.treatmentSelections[0]?.treatmentMinutes ?? null;

  const treatmentsFilled = state.treatmentSelections
    .slice(0, state.partySize)
    .every((sel) => sel.treatmentId !== null && sel.treatmentMinutes !== null);
  const canContinue = treatmentsFilled;

  const handleSelectMassage = (massage: MassageType) => {
    dispatch({ type: "SET_TREATMENT", index: editingGuestIndex, treatmentId: massage.id });
  };

  // Not every massage offers every duration, so once staff picks a duration
  // the grid narrows to massages that actually offer it.
  const availableMassages = massages.filter((m) => {
    if (!isAvailableForPartySize(m, state.partySize)) return false;
    if (currentMinutes === null) return true;
    return availableDurations(m, state.partySize).some((d) => d.minutes === currentMinutes);
  });

  const otherGuestSummary = (index: number) => {
    const sel = state.treatmentSelections[index];
    const treatment = massages.find((m) => m.id === sel?.treatmentId);
    return treatment ? treatment.name : t("notChosen", lang);
  };

  const durationOptions = allDurationsForPartySize(massages, state.partySize);

  return (
    // Tighter vertical padding than the sibling kiosk steps: this is the one
    // screen whose whole point is fitting the entire offer in one viewport.
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-6">
        <h1 className="font-serif text-3xl text-charcoal sm:text-4xl">
          {t("massageChoiceHeading", lang)}
        </h1>
      </div>

      {/* Demoted to a quiet filter row: staff normally know the treatment and
          pick it directly, so duration only needs to narrow the list when a
          guest leads with "I have an hour". "Any" is what makes it clearable —
          without it, picking a duration permanently hides every treatment that
          doesn't offer it. */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-light">
          <Clock size={14} />
          {t("durationHeading", lang)}
        </span>
        {[null, ...durationOptions].map((minutes) => {
          const isSelected = currentMinutes === minutes;
          return (
            <button
              key={minutes ?? "any"}
              type="button"
              onClick={() => dispatch({ type: "SET_TREATMENT_MINUTES", index: 0, minutes })}
              className={`min-h-11 rounded-xl border px-3.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                isSelected
                  ? "border-clay bg-clay-tint text-clay-dark"
                  : "border-sand bg-white text-slate hover:border-clay/40"
              }`}
            >
              {minutes === null ? t("durationAny", lang) : `${minutes} min`}
            </button>
          );
        })}
      </div>

      <div className="mb-6">
        {showPersonTabs && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full border border-sand bg-white p-1 shadow-soft">
              {[0, 1].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setEditingGuestIndex(i)}
                  className={`min-h-10 rounded-full px-5 text-sm font-semibold transition-all duration-300 ${
                    editingGuestIndex === i
                      ? "bg-sage-dark text-cream shadow-soft"
                      : "text-slate hover:bg-oatmeal"
                  }`}
                >
                  {state.guestNames[i]?.trim() || `${t("person", lang)} ${i + 1}`}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-light">
              {state.guestNames[1 - editingGuestIndex]?.trim() ||
                `${t("person", lang)} ${2 - editingGuestIndex}`}
              : {otherGuestSummary(1 - editingGuestIndex)}
            </span>
            {/* The reducer pins one duration across the whole party, so with
                two different treatments on screen the shared length is
                otherwise invisible. */}
            <span className="w-full text-xs text-slate-light">
              {t("sharedDurationNote", lang)}
            </span>
          </div>
        )}

        {availableMassages.length === 0 ? (
          <p className="max-w-md text-sm font-medium text-rose-dark">
            {t("noMassageForDuration", lang)}
          </p>
        ) : (
          // Staff-dense list, not a browse grid: the receptionist already knows
          // the menu and is targeting a known name, so the whole offer fits one
          // tablet viewport with no scroll and no price noise. Row-major order
          // keeps DOM order identical to visual order (correct tab order) and
          // puts the manager's top-sorted service at top-left.
          <ul className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableMassages.map((massage) => {
              const isSelected = selectedId === massage.id;
              const durations = availableDurations(massage, state.partySize);
              return (
                <li key={massage.id}>
                  <div
                    className={`overflow-hidden rounded-2xl border shadow-soft transition-all duration-200 ${
                      isSelected ? "border-clay bg-clay-tint" : "border-sand bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleSelectMassage(massage)}
                      className={`flex min-h-11 w-full items-center px-4 py-3 text-left transition-colors duration-200 active:scale-[0.99] ${
                        isSelected ? "text-clay-dark" : "text-slate hover:bg-oatmeal/60"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {massage.name}
                      </span>
                    </button>

                    {/* Price appears only once a treatment is picked — it's
                        reference detail for the guest conversation, not a
                        selection criterion for staff who know the offer. */}
                    {isSelected && (
                      <div className="flex flex-wrap gap-2 border-t border-clay/25 px-4 pb-3 pt-3">
                        {durations.map((d) => {
                          const price = durationPrice(d, state.partySize);
                          const isActive = currentMinutes === d.minutes;
                          return (
                            <button
                              key={d.minutes}
                              type="button"
                              aria-pressed={isActive}
                              onClick={() =>
                                dispatch({
                                  type: "SET_TREATMENT_MINUTES",
                                  index: 0,
                                  minutes: d.minutes,
                                })
                              }
                              // Stacked, not inline: three inline chips wrap to
                              // three lines in a narrow column and triple the
                              // row's height.
                              className={`flex min-h-11 flex-col items-center justify-center rounded-xl border px-2.5 py-1 text-sm font-semibold leading-tight transition-all duration-200 active:scale-[0.98] ${
                                isActive
                                  ? "border-sage-dark bg-sage-dark text-cream"
                                  : "border-sand bg-white text-slate hover:border-clay/40"
                              }`}
                            >
                              <span>{d.minutes} min</span>
                              {price !== undefined && (
                                <span
                                  className={`text-xs font-medium ${isActive ? "text-cream/75" : "text-slate-light"}`}
                                >
                                  {formatPrice(price)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: "SET_STEP", step: "welcome" })}
          className="w-full sm:w-auto"
        >
          <ArrowLeft size={18} />
          {t("backButton", lang)}
        </Button>
        <Button
          disabled={!canContinue}
          onClick={() => dispatch({ type: "SET_STEP", step: "staffHandoff" })}
          className="w-full sm:w-auto"
        >
          {t("handToGuest", lang)}
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}
