import { useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { completeIntake, type IntakeRow } from "../../lib/intakes";
import { t } from "../../i18n/translations";
import { Button } from "../Button";
import { VisitFieldsForm, useVisitFields } from "./VisitFieldsForm";

// Reception's second half of a QR self-check-in: the guest's phone already
// supplied preferences (personalizations[0]); this fills in what only a
// staffer can supply — name, therapist, treatment — and flips the row from
// "incomplete" to "submitted" via completeIntake (src/lib/intakes.ts), a
// direct RLS-gated update, same access as marking a visit done.
//
// The fields themselves live in VisitFieldsForm, shared with /upcoming's
// pre-visit link creation, which collects exactly the same set up front.
export function CompleteIntakeModal({
  row,
  onClose,
  onSaved,
}: {
  row: IntakeRow;
  onClose: () => void;
  onSaved: (updated: IntakeRow) => void;
}) {
  const { lang } = useLanguage();
  const fields = useVisitFields(row.location_id);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const built = fields.buildFields();
      await completeIntake(row.id, built);
      onSaved({
        ...row,
        status: "submitted",
        guest_names: built.guestNames,
        treatment_selections: built.treatmentSelections,
        therapists: built.therapists,
        room_assignments: built.roomAssignments,
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const error = saveError ?? fields.loadError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/70 p-4">
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-soft sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close", lang)}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-slate-light hover:bg-oatmeal"
        >
          <X size={20} />
        </button>

        <h2 className="mb-6 font-serif text-2xl text-charcoal">{t("completeIntakeTitle", lang)}</h2>

        {error && <p className="mb-4 text-sm text-rose-dark">{error}</p>}

        <VisitFieldsForm fields={fields} idPrefix="complete" />

        <Button onClick={handleSave} disabled={!fields.canSave || saving} className="mt-6 w-full">
          {t("completeIntakeSubmit", lang)}
        </Button>
      </div>
    </div>
  );
}
