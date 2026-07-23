import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { fetchCatalog, toMassageTypes } from "../../lib/catalog";
import { fetchRooms, fetchTherapists, type RoomOption, type TherapistOption } from "../../lib/kiosk";
import { completeIntake, buildTreatmentSnapshots, type IntakeRow } from "../../lib/intakes";
import { t } from "../../i18n/translations";
import { availableDurations } from "../../data/massageTypes";
import { Button } from "../Button";

// Reception's second half of a QR self-check-in: the guest's phone already
// supplied preferences (personalizations[0]); this fills in what only a
// staffer can supply — name, therapist, treatment — and flips the row from
// "incomplete" to "submitted" via completeIntake (src/lib/intakes.ts), a
// direct RLS-gated update, same access as marking a visit done.
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
  const [name, setName] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [therapistId, setTherapistId] = useState("");
  const [therapists, setTherapists] = useState<TherapistOption[]>([]);
  const [roomId, setRoomId] = useState("");
  const [bedId, setBedId] = useState("");
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof fetchCatalog>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchCatalog(row.location_id), fetchTherapists(row.location_id), fetchRooms(row.location_id)])
      .then(([cat, ths, rms]) => {
        if (cancelled) return;
        setCatalog(cat);
        setTherapists(ths);
        setRooms(rms);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [row.location_id]);

  const massages = toMassageTypes(catalog, lang);
  const selectedMassage = massages.find((m) => m.id === treatmentId) ?? null;
  const durations = selectedMassage ? availableDurations(selectedMassage, 1) : [];
  const selectedRoom = rooms.find((r) => r.id === roomId) ?? null;

  const canSave = name.trim().length > 0 && treatmentId !== "" && minutes !== null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const snapshots = buildTreatmentSnapshots([{ treatmentId, treatmentMinutes: minutes }], 1, catalog);
      const therapist = therapists.find((th) => th.id === therapistId) ?? null;
      const bed = selectedRoom?.beds.find((b) => b.id === bedId) ?? null;
      const roomAssignment = selectedRoom
        ? { roomId: selectedRoom.id, roomName: selectedRoom.name, bedId: bed?.id ?? null, bedName: bed?.name ?? null }
        : null;
      await completeIntake(row.id, {
        guestNames: [name.trim()],
        treatmentSelections: snapshots,
        therapists: [therapist],
        roomAssignments: [roomAssignment],
      });
      onSaved({
        ...row,
        status: "submitted",
        guest_names: [name.trim()],
        treatment_selections: snapshots,
        therapists: [therapist],
        room_assignments: [roomAssignment],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

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

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="completeName" className="mb-1.5 block text-sm font-semibold text-charcoal">
              {t("nameGuest", lang)}
            </label>
            <input
              id="completeName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder", lang)}
              className="min-h-11 w-full rounded-xl border border-sand bg-white px-3 text-base text-charcoal outline-none focus:border-clay focus:ring-4 focus:ring-clay/15"
            />
          </div>

          <div>
            <label htmlFor="completeTreatment" className="mb-1.5 block text-sm font-semibold text-charcoal">
              {t("treatment", lang)}
            </label>
            <select
              id="completeTreatment"
              value={treatmentId}
              disabled={loading}
              onChange={(e) => {
                setTreatmentId(e.target.value);
                setMinutes(null);
              }}
              className="min-h-11 w-full rounded-xl border border-sand bg-white px-3 text-base text-charcoal outline-none focus:border-clay focus:ring-4 focus:ring-clay/15"
            >
              <option value="">—</option>
              {massages.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {selectedMassage && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-charcoal">
                {t("durationHeading", lang)}
              </label>
              <div className="flex flex-wrap gap-2">
                {durations.map((d) => (
                  <button
                    key={d.minutes}
                    type="button"
                    onClick={() => setMinutes(d.minutes)}
                    className={`min-h-10 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                      minutes === d.minutes
                        ? "border-sage-dark bg-sage-dark text-cream"
                        : "border-sand bg-white text-slate hover:border-clay/40"
                    }`}
                  >
                    {d.minutes} min
                  </button>
                ))}
              </div>
            </div>
          )}

          {therapists.length > 0 && (
            <div>
              <label htmlFor="completeTherapist" className="mb-1.5 block text-sm font-semibold text-charcoal">
                {t("therapistLabel", lang)}
              </label>
              <select
                id="completeTherapist"
                value={therapistId}
                onChange={(e) => setTherapistId(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-sand bg-white px-3 text-base text-charcoal outline-none focus:border-clay focus:ring-4 focus:ring-clay/15"
              >
                <option value="">{t("therapistChoose", lang)}</option>
                {therapists.map((th) => (
                  <option key={th.id} value={th.id}>
                    {th.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {rooms.length > 0 && (
            <div>
              <label htmlFor="completeRoom" className="mb-1.5 block text-sm font-semibold text-charcoal">
                {t("roomLabel", lang)}
              </label>
              <div className="flex flex-wrap gap-2">
                <select
                  id="completeRoom"
                  value={roomId}
                  onChange={(e) => {
                    setRoomId(e.target.value);
                    setBedId("");
                  }}
                  className="min-h-11 flex-1 rounded-xl border border-sand bg-white px-3 text-base text-charcoal outline-none focus:border-clay focus:ring-4 focus:ring-clay/15"
                >
                  <option value="">{t("roomChoose", lang)}</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {selectedRoom && selectedRoom.beds.length > 0 && (
                  <select
                    id="completeBed"
                    value={bedId}
                    onChange={(e) => setBedId(e.target.value)}
                    className="min-h-11 flex-1 rounded-xl border border-sand bg-white px-3 text-base text-charcoal outline-none focus:border-clay focus:ring-4 focus:ring-clay/15"
                  >
                    <option value="">{t("bedChoose", lang)}</option>
                    {selectedRoom.beds.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={!canSave || saving} className="mt-6 w-full">
          {t("completeIntakeSubmit", lang)}
        </Button>
      </div>
    </div>
  );
}
