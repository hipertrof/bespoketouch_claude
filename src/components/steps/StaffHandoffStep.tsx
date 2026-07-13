import { ArrowRight, Hand } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { Button } from "../Button";
import { massageTypes } from "../../data/massageTypes";
import { guestDisplayName } from "../../utils/guestName";

export function StaffHandoffStep() {
  const { state, dispatch } = useGuest();
  const isCouple = state.partySize === 2;
  const showSeparate = isCouple && state.separateTreatments;

  const treatmentLine = (index: number) => {
    const sel = state.treatmentSelections[index];
    const treatment = massageTypes.find((m) => m.id === sel?.treatmentId);
    if (!treatment) return "—";
    return `${treatment.name}${sel?.treatmentMinutes ? ` (${sel.treatmentMinutes} min)` : ""}`;
  };

  const singleTreatment = massageTypes.find((m) => m.id === state.treatmentSelections[0]?.treatmentId);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col items-center justify-center px-4 py-14 text-center sm:px-6">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-clay-tint text-clay-dark">
        <Hand size={36} strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 font-serif text-3xl text-charcoal sm:text-4xl">
        Wszystko gotowe, {guestDisplayName(state.guestNames, state.partySize)}.
      </h1>

      {showSeparate ? (
        <div className="flex flex-col gap-1 text-left">
          {[0, 1].map((i) => (
            <p key={i} className="text-base leading-relaxed text-slate sm:text-lg">
              <span className="font-semibold text-charcoal">
                {state.guestNames[i]?.trim() || `Osoba ${i + 1}`}:
              </span>{" "}
              {treatmentLine(i)}
            </p>
          ))}
        </div>
      ) : (
        <p className="max-w-md text-base leading-relaxed text-slate sm:text-lg">
          {singleTreatment
            ? `Wybrany zabieg to ${singleTreatment.name.toLowerCase()}${
                state.treatmentSelections[0]?.treatmentMinutes
                  ? ` (${state.treatmentSelections[0].treatmentMinutes} min)`
                  : ""
              }.`
            : "Twój zabieg jest już wybrany."}
        </p>
      )}

      <p className="mt-3 max-w-md text-base leading-relaxed text-slate sm:text-lg">
        Zaznacz teraz obszary pracy na mapie ciała i dopasuj swoje
        preferencje.
      </p>

      {isCouple && (
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-light">
          {showSeparate
            ? "Każda osoba ma wybrany własny zabieg — najpierw personalizuje pierwsza osoba, a po zakończeniu przekażecie tablet drugiej."
            : "Ten zabieg jest dla dwóch osób — najpierw personalizuje pierwsza osoba, a po zakończeniu przekażecie tablet drugiej."}
        </p>
      )}

      <Button onClick={() => dispatch({ type: "SET_STEP", step: "bodyMap" })} className="mt-10">
        Rozpocznij personalizację
        <ArrowRight size={18} />
      </Button>
    </div>
  );
}
