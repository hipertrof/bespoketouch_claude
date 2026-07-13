import { ArrowRight, Hand } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { Button } from "../Button";
import { massageTypes } from "../../data/massageTypes";
import { guestDisplayName } from "../../utils/guestName";

export function StaffHandoffStep() {
  const { state, dispatch } = useGuest();
  const treatment = massageTypes.find((m) => m.id === state.treatmentId);
  const isCouple = state.partySize === 2;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col items-center justify-center px-4 py-14 text-center sm:px-6">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-clay-tint text-clay-dark">
        <Hand size={36} strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 font-serif text-3xl text-charcoal sm:text-4xl">
        Wszystko gotowe, {guestDisplayName(state.guestNames, state.partySize)}.
      </h1>
      <p className="max-w-md text-base leading-relaxed text-slate sm:text-lg">
        {treatment
          ? `Wybrany zabieg to ${treatment.name.toLowerCase()}${
              state.treatmentMinutes ? ` (${state.treatmentMinutes} min)` : ""
            }.`
          : "Twój zabieg jest już wybrany."}{" "}
        Zaznacz teraz obszary pracy na mapie ciała i dopasuj swoje
        preferencje.
      </p>

      {isCouple && (
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-light">
          Ten zabieg jest dla dwóch osób — najpierw personalizuje pierwsza
          osoba, a po zakończeniu przekażecie tablet drugiej.
        </p>
      )}

      <Button onClick={() => dispatch({ type: "SET_STEP", step: "bodyMap" })} className="mt-10">
        Rozpocznij personalizację
        <ArrowRight size={18} />
      </Button>
    </div>
  );
}
