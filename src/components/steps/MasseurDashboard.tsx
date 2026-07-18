import { CheckCircle2, RotateCcw } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { useCatalog } from "../../context/CatalogContext";
import { useDevice } from "../../context/DeviceContext";
import { Button } from "../Button";
import { IntakePanel, type IntakePanelView } from "../IntakePanel";
import { buildTreatmentSnapshots } from "../../lib/intakes";
import { t } from "../../i18n/translations";

// Kiosk therapist view: renders the live in-session intake. The shared
// IntakePanel does the rendering; this wrapper only supplies the session data
// and the kiosk-specific reset control.
export function MasseurDashboard() {
  const { state, dispatch } = useGuest();
  const { catalog } = useCatalog();
  const { token } = useDevice();

  const view: IntakePanelView = {
    partySize: state.partySize,
    separateTreatments: state.separateTreatments,
    guestNames: state.guestNames,
    guests: state.guests,
    treatments: buildTreatmentSnapshots(state.treatmentSelections, state.partySize, catalog),
  };

  return (
    <IntakePanel
      view={view}
      initialLang={state.language}
      deviceToken={token}
      actions={(lang) => (
        <Button
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={() => dispatch({ type: "RESET_SESSION" })}
        >
          <RotateCcw size={18} />
          {t("endSession", lang)}
        </Button>
      )}
      footerNote={(lang) => (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-light">
          <CheckCircle2 size={14} />
          {t("lockedByGuest", lang)}
        </div>
      )}
    />
  );
}
