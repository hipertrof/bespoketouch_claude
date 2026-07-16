import { useEffect, useRef, useState } from "react";
import { CheckCircle2, UserCog } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { useCatalog } from "../../context/CatalogContext";
import { Button } from "../Button";
import { t, tf } from "../../i18n/translations";
import { guestDisplayName } from "../../utils/guestName";
import { buildTreatmentSnapshots, saveIntake } from "../../lib/intakes";

export function HandoffStep() {
  const { state, dispatch } = useGuest();
  const { catalog, locationId, loading } = useCatalog();
  const lang = state.language;
  const isCouple = state.partySize === 2;

  // Persist the locked intake once, in the background. This is the "lock" point:
  // the guest has finished and handed the tablet back. Only for a paired
  // location (a real ?location=) — the bundled demo has nowhere to write. The
  // ref makes it fire exactly once even under StrictMode's double-effect.
  const savedRef = useRef(false);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    if (savedRef.current || loading || !locationId) return;
    savedRef.current = true;
    const size = state.partySize;
    saveIntake({
      locationId,
      partySize: size,
      guestNames: state.guestNames.slice(0, size).map((n) => n.trim()),
      treatmentSelections: buildTreatmentSnapshots(
        state.treatmentSelections.slice(0, size),
        size,
        catalog,
      ),
      personalizations: state.guests.slice(0, size),
      therapists: state.guestTherapists.slice(0, size),
    }).catch((err) => {
      console.error("[intake] save failed:", err);
      savedRef.current = false; // allow a retry on the next render
      setSaveError(true);
    });
  }, [loading, locationId, catalog, state]);

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

      {saveError && (
        <p className="mt-6 max-w-md text-sm text-rose-dark">{t("intakeSaveFailed", lang)}</p>
      )}
    </div>
  );
}
