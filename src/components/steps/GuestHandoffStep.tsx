import { ArrowRight, Hand } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { Button } from "../Button";

// Interstitial shown between the two guests of a couple's treatment, once
// the first person has finished the body map + preferences steps.
export function GuestHandoffStep() {
  const { dispatch } = useGuest();

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col items-center justify-center px-4 py-14 text-center sm:px-6">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-clay-tint text-clay-dark">
        <Hand size={36} strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 font-serif text-3xl text-charcoal sm:text-4xl">
        Dziękujemy! Teraz kolej na drugą osobę.
      </h1>
      <p className="max-w-md text-base leading-relaxed text-slate sm:text-lg">
        Przekaż tablet drugiej osobie, aby mogła zaznaczyć swoje obszary
        pracy i dopasować własne preferencje.
      </p>

      <Button onClick={() => dispatch({ type: "SET_STEP", step: "bodyMap" })} className="mt-10">
        Rozpocznij personalizację
        <ArrowRight size={18} />
      </Button>
    </div>
  );
}
