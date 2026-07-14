import { CheckCircle2, UserCog } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { Button } from "../Button";
import { t, tf } from "../../i18n/translations";
import { guestDisplayName } from "../../utils/guestName";

export function HandoffStep() {
  const { state, dispatch } = useGuest();
  const lang = state.language;
  const isCouple = state.partySize === 2;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col items-center justify-center px-4 py-14 text-center sm:px-6">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-sage-tint text-sage-dark">
        <CheckCircle2 size={40} strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 font-serif text-3xl text-charcoal sm:text-4xl">
        {tf("thanksName", lang, { name: guestDisplayName(state.guestNames, state.partySize, lang) })}
      </h1>
      <p className="max-w-md text-base leading-relaxed text-slate sm:text-lg">
        {isCouple ? t("prefsSavedCouple", lang) : t("prefsSavedSingle", lang)}{" "}
        {t("passTablet", lang)}
      </p>

      <Button
        variant="secondary"
        onClick={() => dispatch({ type: "SET_STEP", step: "masseur" })}
        className="mt-16"
      >
        <UserCog size={18} />
        {t("therapistPanel", lang)}
      </Button>
    </div>
  );
}
