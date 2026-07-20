import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { useCatalog } from "../../context/CatalogContext";
import { useDevice } from "../../context/DeviceContext";
import { t, tf } from "../../i18n/translations";
import { guestDisplayName } from "../../utils/guestName";
import { buildTreatmentSnapshots, saveIntake } from "../../lib/intakes";
import { forgetGuestProfile, saveGuestProfile } from "../../lib/guestProfile";

export function HandoffStep() {
  const { state } = useGuest();
  const { catalog, loading } = useCatalog();
  const { token } = useDevice();
  const lang = state.language;
  const isCouple = state.partySize === 2;

  // Persist the locked intake once, in the background. This is the "lock" point:
  // the guest has finished and handed the tablet back. Only a paired device can
  // write — the server derives the location from the token, and the bundled demo
  // has no token and nowhere to write. The ref makes it fire exactly once even
  // under StrictMode's double-effect.
  const savedRef = useRef(false);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    if (savedRef.current || loading || !token) return;
    savedRef.current = true;
    const size = state.partySize;
    saveIntake({
      deviceToken: token,
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
  }, [loading, token, catalog, state]);

  // Opt-in guest CRM: persist each consenting guest's reusable preferences under
  // an HMAC-of-phone pseudonym. Fire-once, own guard (StrictMode-safe). Skipped
  // for the bundled demo (no token). Non-blocking and NOT retried on error — the
  // upsert is idempotent and a lost preference save is only cosmetic.
  //
  // The inverse also holds: a guest whose profile WAS looked up (prefilled) but
  // who finishes with consent switched off has withdrawn it — erase the stored
  // profile. Withdrawal must be as effective as the grant (GDPR art. 7(3)).
  // A never-prefilled guest with consent off stays a no-op: an unticked toggle
  // must not delete a profile that was never loaded (shared phone, typo).
  const crmSavedRef = useRef(false);
  useEffect(() => {
    if (crmSavedRef.current || loading || !token) return;
    crmSavedRef.current = true;
    const size = state.partySize;
    const ops = state.guestCrm.slice(0, size).flatMap((crm, i) => {
      if (crm.phone.replace(/\D/g, "").length < 8) return [];
      if (crm.consent) return [saveGuestProfile(token, crm.phone, state.guests[i])];
      if (crm.prefilled) return [forgetGuestProfile(token, crm.phone)];
      return [];
    });
    if (ops.length > 0) {
      void Promise.allSettled(ops).then((results) => {
        for (const r of results) {
          if (r.status === "rejected") console.error("[crm] save/forget failed:", r.reason);
        }
      });
    }
  }, [loading, token, state]);

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

      {saveError && (
        <p className="mt-6 max-w-md text-sm text-rose-dark">{t("intakeSaveFailed", lang)}</p>
      )}
    </div>
  );
}
