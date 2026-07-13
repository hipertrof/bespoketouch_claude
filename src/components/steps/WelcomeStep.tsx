import { useState } from "react";
import { ArrowRight, Sparkles, Users } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import {
  massageTypes,
  availableDurations,
  durationPrice,
  formatPrice,
  isAvailableForPartySize,
  lowestPrice,
} from "../../data/massageTypes";
import { Button } from "../Button";
import type { MassageType, PartySize } from "../../types";

const partySizeOptions: { value: PartySize; label: string }[] = [
  { value: 1, label: "1 osoba" },
  { value: 2, label: "2 osoby (para)" },
];

export function WelcomeStep() {
  const { state, dispatch } = useGuest();
  const [name, setName] = useState(state.guestName);
  const selectedId = state.treatmentId;

  const canContinue = name.trim().length > 0 && selectedId !== null && state.treatmentMinutes !== null;

  const handleContinue = () => {
    dispatch({ type: "SET_NAME", name: name.trim() });
    dispatch({ type: "SET_STEP", step: "staffHandoff" });
  };

  const handleSelectMassage = (massage: MassageType) => {
    dispatch({ type: "SET_TREATMENT", treatmentId: massage.id });
    const durations = availableDurations(massage, state.partySize);
    if (durations.length === 1) {
      dispatch({ type: "SET_TREATMENT_MINUTES", minutes: durations[0].minutes });
    }
  };

  const availableMassages = massageTypes.filter((m) => isAvailableForPartySize(m, state.partySize));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mb-10 flex flex-col items-start gap-3 sm:mb-14">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-tint px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sage-dark">
          <Sparkles size={12} />
          Zameldowanie gościa
        </span>
        <h1 className="font-serif text-3xl leading-tight text-charcoal sm:text-4xl lg:text-5xl">
          Witaj w BespokeTouch.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-slate sm:text-lg">
          Uzupełnij dane gościa i wybrany zabieg, a następnie przekaż tablet,
          aby mógł spersonalizować swój masaż.
        </p>
      </div>

      <div className="mb-10">
        <label
          htmlFor="guestName"
          className="mb-2.5 block text-sm font-semibold text-charcoal"
        >
          Imię gościa
        </label>
        <input
          id="guestName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Wpisz imię gościa"
          className="min-h-14 w-full max-w-md rounded-2xl border border-sand bg-white px-5 text-lg text-charcoal placeholder:text-slate-light/70 shadow-soft outline-none transition-all duration-300 focus:border-clay focus:ring-4 focus:ring-clay/15 sm:max-w-sm"
        />
      </div>

      <div className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-charcoal">
          <Users size={16} className="text-slate-light" />
          Liczba osób
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
              {opt.label}
            </button>
          ))}
        </div>
        {state.partySize === 2 && (
          <p className="mt-2.5 max-w-md text-xs leading-relaxed text-slate-light">
            Osoby personalizują masaż kolejno, jedna po drugiej, na tym samym
            tablecie.
          </p>
        )}
      </div>

      <div className="mb-10">
        <h2 className="mb-4 text-sm font-semibold text-charcoal">
          Wybór masażu
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {availableMassages.map((massage) => {
            const isSelected = selectedId === massage.id;
            const durations = availableDurations(massage, state.partySize);
            const from = lowestPrice(massage, state.partySize);
            return (
              <div
                key={massage.id}
                className={`flex min-h-32 flex-col justify-between rounded-2xl border p-5 shadow-soft transition-all duration-300 ${
                  isSelected
                    ? "border-clay bg-clay-tint ring-2 ring-clay/40"
                    : "border-sand bg-white hover:border-clay/50 hover:bg-oatmeal/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelectMassage(massage)}
                  className="flex w-full flex-col items-start gap-1 text-left active:scale-[0.98]"
                >
                  <h3 className="text-base font-semibold text-charcoal">
                    {massage.name}
                  </h3>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-light">
                    {durations.length > 1 ? `od ${formatPrice(from!)}` : formatPrice(from!)}
                  </span>
                </button>

                {isSelected && (
                  <div className="mt-3">
                    <p className="text-sm leading-relaxed text-charcoal/80">
                      {massage.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {durations.map((d) => {
                        const isDurationSelected = state.treatmentMinutes === d.minutes;
                        return (
                          <button
                            key={d.minutes}
                            type="button"
                            onClick={() =>
                              dispatch({ type: "SET_TREATMENT_MINUTES", minutes: d.minutes })
                            }
                            className={`min-h-10 rounded-lg border px-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                              isDurationSelected
                                ? "border-sage-dark bg-sage-dark text-cream"
                                : "border-sand bg-white text-slate hover:border-clay/40"
                            }`}
                          >
                            {d.minutes} min · {formatPrice(durationPrice(d, state.partySize)!)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          disabled={!canContinue}
          onClick={handleContinue}
          className="w-full sm:w-auto"
        >
          Przekaż tablet gościowi
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}
