import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Sparkles, Users } from "lucide-react";
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
import { Toggle } from "../Toggle";
import type { BodyGender, MassageType, PartySize } from "../../types";

const partySizeOptions: { value: PartySize; labelKey: string }[] = [
  { value: 1, labelKey: "partyOne" },
  { value: 2, labelKey: "partyTwo" },
];

export function WelcomeStep() {
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

  const namesFilled = state.guestNames
    .slice(0, state.partySize)
    .every((n) => n.trim().length > 0);
  const treatmentsFilled = state.treatmentSelections
    .slice(0, state.partySize)
    .every((sel) => sel.treatmentId !== null && sel.treatmentMinutes !== null);
  const canContinue = namesFilled && treatmentsFilled;

  const handleContinue = () => {
    state.guestNames.slice(0, state.partySize).forEach((n, i) => {
      dispatch({ type: "SET_GUEST_NAME", index: i, name: n.trim() });
    });
    dispatch({ type: "SET_STEP", step: "staffHandoff" });
  };

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
      <div className="mb-10 flex flex-col items-start gap-3 sm:mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-tint px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sage-dark">
          <Sparkles size={12} />
          {t("checkInBadge", lang)}
        </span>
      </div>

      <div className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-charcoal">
          <Users size={16} className="text-slate-light" />
          {t("partySize", lang)}
        </h2>
        <div className="inline-flex rounded-full border border-sand bg-white p-1 shadow-soft">
          {partySizeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => dispatch({ type: "SET_PARTY_SIZE", partySize: opt.value })}
              className={`min-h-12 rounded-full px-6 text-sm font-semibold transition-all duration-300 ${
                state.partySize === opt.value
                  ? "bg-clay text-white shadow-soft"
                  : "text-slate hover:bg-oatmeal"
              }`}
            >
              {t(opt.labelKey, lang)}
            </button>
          ))}
        </div>
        {isCouple && (
          <p className="mt-2.5 max-w-md text-xs leading-relaxed text-slate-light">
            {t("coupleHint", lang)}
          </p>
        )}
      </div>

      <div className="mb-10 flex flex-wrap gap-8">
        {Array.from({ length: state.partySize }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <div>
              <label
                htmlFor={`guestName-${i}`}
                className="mb-2.5 block text-sm font-semibold text-charcoal"
              >
                {!isCouple
                  ? t("nameGuest", lang)
                  : i === 0
                    ? t("nameFirst", lang)
                    : t("nameSecond", lang)}
              </label>
              <input
                id={`guestName-${i}`}
                type="text"
                value={state.guestNames[i] ?? ""}
                onChange={(e) =>
                  dispatch({ type: "SET_GUEST_NAME", index: i, name: e.target.value })
                }
                placeholder={t("namePlaceholder", lang)}
                className="min-h-14 w-full max-w-md rounded-2xl border border-sand bg-white px-5 text-base text-charcoal placeholder:text-sm placeholder:text-slate-light/70 shadow-soft outline-none transition-all duration-300 focus:border-clay focus:ring-4 focus:ring-clay/15 sm:max-w-sm"
              />
            </div>
            <div>
              <div className="inline-flex self-start rounded-full border border-sand bg-white p-1 shadow-soft">
                {(["female", "male"] as BodyGender[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => dispatch({ type: "SET_GUEST_GENDER", index: i, bodyGender: g })}
                    className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-all duration-300 ${
                      state.guests[i]?.bodyGender === g
                        ? "bg-clay text-white shadow-soft"
                        : "text-slate hover:bg-oatmeal"
                    }`}
                  >
                    {g === "male" ? t("genderMale", lang) : t("genderFemale", lang)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {isCouple && (
        <div className="mb-10 flex items-center gap-3 rounded-2xl border border-sand bg-white p-4 shadow-soft">
          <Toggle
            checked={state.separateTreatments}
            onChange={(v) => dispatch({ type: "SET_SEPARATE_TREATMENTS", separate: v })}
            label={t("differentMassages", lang)}
          />
          <div>
            <div className="text-sm font-semibold text-charcoal">
              {t("differentMassages", lang)}
            </div>
            <div className="text-xs text-slate-light">
              {state.separateTreatments
                ? t("differentMassagesOn", lang)
                : t("differentMassagesOff", lang)}
            </div>
          </div>
        </div>
      )}

      <div className="mb-10">
        <h2 className="mb-1 text-sm font-semibold text-charcoal">
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
                onClick={() =>
                  dispatch({ type: "SET_TREATMENT_MINUTES", index: 0, minutes })
                }
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
        <h2 className="mb-4 text-sm font-semibold text-charcoal">
          {t("massageChoiceHeading", lang)}
        </h2>

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

      <div className="flex justify-end">
        <Button
          disabled={!canContinue}
          onClick={handleContinue}
          className="w-full sm:w-auto"
        >
          {t("handToGuest", lang)}
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}
