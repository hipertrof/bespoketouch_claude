import { ArrowRight, Hand } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { Button } from "../Button";

// Interstitial shown between the two guests of a couple's treatment, once
// the first person has finished the body map + preferences steps.
export function GuestHandoffStep() {
  const { state, dispatch } = useGuest();
  // activeGuestIndex is already advanced to the next guest by the time this
  // screen renders (see COMPLETE_GUEST_PREFERENCES), so index 0 is always
  // "who just finished" and activeGuestIndex is "who's next".
  const finishedName = state.guestNames[0]?.trim() || "Pierwsza osoba";
  const nextName = state.guestNames[state.activeGuestIndex]?.trim() || "Druga osoba";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col items-center justify-center px-4 py-14 text-center sm:px-6">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-clay-tint text-clay-dark">
        <Hand size={36} strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 font-serif text-3xl text-charcoal sm:text-4xl">
        Dziękujemy, {finishedName}! Kolejna osoba: {nextName}.
      </h1>
      <p className="max-w-md text-base leading-relaxed text-slate sm:text-lg">
        {nextName}, przekazujemy Ci tablet — możesz teraz zaznaczyć swoje
        obszary pracy i dopasować własne preferencje.
      </p>

      <Button onClick={() => dispatch({ type: "SET_STEP", step: "bodyMap" })} className="mt-10">
        Rozpocznij personalizację
        <ArrowRight size={18} />
      </Button>
    </div>
  );
}
