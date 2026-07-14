import { ArrowRight, Hand } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { Button } from "../Button";
import { t, tf } from "../../i18n/translations";

// Interstitial shown between the two guests of a couple's treatment, once
// the first person has finished the body map + preferences steps.
export function GuestHandoffStep() {
  const { state, dispatch } = useGuest();
  const lang = state.language;
  // activeGuestIndex is already advanced to the next guest by the time this
  // screen renders (see COMPLETE_GUEST_PREFERENCES), so index 0 is always
  // "who just finished" and activeGuestIndex is "who's next".
  const finishedName = state.guestNames[0]?.trim() || t("firstPerson", lang);
  const nextName = state.guestNames[state.activeGuestIndex]?.trim() || t("secondPerson", lang);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col items-center justify-center px-4 py-14 text-center sm:px-6">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-clay-tint text-clay-dark">
        <Hand size={36} strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 font-serif text-3xl text-charcoal sm:text-4xl">
        {tf("guestHandoffTitle", lang, { finished: finishedName, next: nextName })}
      </h1>
      <p className="max-w-md text-base leading-relaxed text-slate sm:text-lg">
        {tf("guestHandoffBody", lang, { next: nextName })}
      </p>

      <Button onClick={() => dispatch({ type: "SET_STEP", step: "bodyMap" })} className="mt-10">
        {t("startPersonalization", lang)}
        <ArrowRight size={18} />
      </Button>
    </div>
  );
}
