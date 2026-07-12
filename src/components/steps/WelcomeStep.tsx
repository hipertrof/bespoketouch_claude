import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { massageTypes } from "../../data/massageTypes";
import { Button } from "../Button";
import type { BodyGender } from "../../types";

export function WelcomeStep() {
  const { state, dispatch } = useGuest();
  const [name, setName] = useState(state.guestName);
  const selectedId = state.treatmentId;

  const canContinue = name.trim().length > 0 && selectedId !== null;

  const handleContinue = () => {
    dispatch({ type: "SET_NAME", name: name.trim() });
    dispatch({ type: "SET_STEP", step: "staffHandoff" });
  };

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
        <h2 className="mb-4 text-sm font-semibold text-charcoal">
          Sylwetka na mapie ciała
        </h2>
        <div className="inline-flex rounded-full border border-sand bg-white p-1 shadow-soft">
          {(["female", "male"] as BodyGender[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => dispatch({ type: "SET_BODY_GENDER", bodyGender: g })}
              className={`min-h-12 rounded-full px-6 text-sm font-semibold transition-all duration-300 ${
                state.bodyGender === g
                  ? "bg-clay text-white shadow-soft"
                  : "text-slate hover:bg-oatmeal"
              }`}
            >
              {g === "male" ? "Mężczyzna" : "Kobieta"}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-10">
        <h2 className="mb-4 text-sm font-semibold text-charcoal">
          Wybór masażu
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {massageTypes.map((massage) => {
            const isSelected = selectedId === massage.id;
            return (
              <button
                key={massage.id}
                type="button"
                onClick={() =>
                  dispatch({ type: "SET_TREATMENT", treatmentId: massage.id })
                }
                className={`group flex min-h-32 flex-col justify-between rounded-2xl border p-5 text-left shadow-soft transition-all duration-300 active:scale-[0.98] ${
                  isSelected
                    ? "border-clay bg-clay-tint ring-2 ring-clay/40"
                    : "border-sand bg-white hover:border-clay/50 hover:bg-oatmeal/60"
                }`}
              >
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-charcoal">
                      {massage.name}
                    </h3>
                  </div>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-light">
                    {massage.duration}
                  </span>
                </div>
                {isSelected && (
                  <p className="mt-3 text-sm leading-relaxed text-charcoal/80">
                    {massage.description}
                  </p>
                )}
              </button>
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
