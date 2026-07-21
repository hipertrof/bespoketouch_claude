import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { useCatalog } from "../../context/CatalogContext";
import { toMassageTypes } from "../../lib/catalog";
import {
  allDurationsForPartySize,
  availableDurations,
  formatPrice,
  isAvailableForPartySize,
  lowestPrice,
} from "../../data/massageTypes";
import { t, tf } from "../../i18n/translations";
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
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mb-10">
        <h1 className="font-serif text-3xl text-charcoal sm:text-4xl">
          {t("massageChoiceHeading", lang)}
        </h1>
      </div>

      <div className="mb-10">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-charcoal">
          <Clock size={16} className="text-slate-light" />
          {t("durationHeading", lang)}
        </h2>
        <p className="mb-4 text-xs text-slate-light">
          {isCouple ? t("durationHintCouple", lang) : t("durationHint", lang)}
        </p>
        <div className="flex flex-wrap gap-2">
          {durationOptions.map((minutes) => {
            const isSelected = currentMinutes === minutes;
            return (
              <button
                key={minutes}
                type="button"
                onClick={() => dispatch({ type: "SET_TREATMENT_MINUTES", index: 0, minutes })}
                className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                  isSelected
                    ? "border-sage-dark bg-sage-dark text-cream"
                    : "border-sand bg-white text-slate hover:border-clay/40"
                }`}
              >
                {minutes} min
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-10">
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
          </div>
        )}

        {availableMassages.length === 0 ? (
          <p className="max-w-md text-sm font-medium text-rose-dark">
            {t("noMassageForDuration", lang)}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableMassages.map((massage) => {
              const isSelected = selectedId === massage.id;
              const durations = availableDurations(massage, state.partySize).filter(
                (d) => currentMinutes === null || d.minutes === currentMinutes,
              );
              const from = lowestPrice(massage, state.partySize);
              return (
                <button
                  key={massage.id}
                  type="button"
                  onClick={() => handleSelectMassage(massage)}
                  className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left shadow-soft transition-all duration-300 active:scale-[0.98] ${
                    isSelected
                      ? "border-clay bg-clay-tint ring-2 ring-clay/40"
                      : "border-sand bg-white hover:border-clay/50 hover:bg-oatmeal/60"
                  }`}
                >
                  <h3 className="text-base font-semibold text-charcoal">{massage.name}</h3>
                  {!state.separateTreatments && (
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-light">
                      {durations.length > 1
                        ? tf("priceFrom", lang, { price: formatPrice(from!) })
                        : formatPrice(from!)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
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
