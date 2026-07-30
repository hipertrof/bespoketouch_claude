import { useEffect, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { fetchCatalog, toMassageTypes } from "../../lib/catalog";
import { fetchRooms, fetchTherapists, type RoomOption, type TherapistOption } from "../../lib/kiosk";
import { buildTreatmentSnapshots, type TreatmentSnapshot } from "../../lib/intakes";
import type { MassageType, RoomAssignment, TherapistAssignment } from "../../types";
import { t } from "../../i18n/translations";
import { availableDurations } from "../../data/massageTypes";

// The fields only a STAFFER can supply for a visit: guest name, treatment +
// duration, therapist, room + bed. Extracted from CompleteIntakeModal because
// two screens now collect exactly this set and they must not drift:
//   * /queue    — finishing a QR self-check-in that arrived incomplete;
//   * /upcoming — pre-filling a planned visit before minting a pre-visit link,
//                 where the same details have to be known up front.
// The markup is unchanged from the original modal; only ownership moved.

export interface VisitFields {
  name: string;
  setName: (v: string) => void;
  treatmentId: string;
  setTreatmentId: (v: string) => void;
  minutes: number | null;
  setMinutes: (v: number | null) => void;
  therapistId: string;
  setTherapistId: (v: string) => void;
  roomId: string;
  setRoomId: (v: string) => void;
  bedId: string;
  setBedId: (v: string) => void;
  massages: MassageType[];
  therapists: TherapistOption[];
  rooms: RoomOption[];
  selectedRoom: RoomOption | null;
  loading: boolean;
  loadError: string | null;
  canSave: boolean;
  // The four index-aligned snapshot arrays an intake (and a planned visit)
  // stores. Name snapshots, not ids alone, so a later rename of a service,
  // therapist or room cannot rewrite history.
  buildFields: () => {
    guestNames: string[];
    treatmentSelections: TreatmentSnapshot[];
    therapists: (TherapistAssignment | null)[];
    roomAssignments: (RoomAssignment | null)[];
  };
}

export function useVisitFields(locationId: string): VisitFields {
  const { lang } = useLanguage();
  const [name, setName] = useState("");
  const [treatmentId, setTreatmentIdRaw] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [therapistId, setTherapistId] = useState("");
  const [therapists, setTherapists] = useState<TherapistOption[]>([]);
  const [roomId, setRoomIdRaw] = useState("");
  const [bedId, setBedId] = useState("");
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof fetchCatalog>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchCatalog(locationId), fetchTherapists(locationId), fetchRooms(locationId)])
      .then(([cat, ths, rms]) => {
        if (cancelled) return;
        setCatalog(cat);
        setTherapists(ths);
        setRooms(rms);
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  // Changing the treatment drops the duration: the new treatment may not offer
  // the old one, and an id+duration pair that cannot be booked would still pass
  // canSave. Same reasoning as the kiosk reducer's SET_TREATMENT_MINUTES.
  const setTreatmentId = (v: string) => {
    setTreatmentIdRaw(v);
    setMinutes(null);
  };
  const setRoomId = (v: string) => {
    setRoomIdRaw(v);
    setBedId("");
  };

  const massages = toMassageTypes(catalog, lang);
  const selectedRoom = rooms.find((r) => r.id === roomId) ?? null;
  const canSave = name.trim().length > 0 && treatmentId !== "" && minutes !== null;

  const buildFields = () => {
    const bed = selectedRoom?.beds.find((b) => b.id === bedId) ?? null;
    const therapist = therapists.find((th) => th.id === therapistId) ?? null;
    return {
      guestNames: [name.trim()],
      treatmentSelections: buildTreatmentSnapshots([{ treatmentId, treatmentMinutes: minutes }], 1, catalog),
      therapists: [therapist],
      roomAssignments: [
        selectedRoom
          ? {
              roomId: selectedRoom.id,
              roomName: selectedRoom.name,
              bedId: bed?.id ?? null,
              bedName: bed?.name ?? null,
            }
          : null,
      ],
    };
  };

  return {
    name,
    setName,
    treatmentId,
    setTreatmentId,
    minutes,
    setMinutes,
    therapistId,
    setTherapistId,
    roomId,
    setRoomId,
    bedId,
    setBedId,
    massages,
    therapists,
    rooms,
    selectedRoom,
    loading,
    loadError,
    canSave,
    buildFields,
  };
}

const FIELD_CLASS =
  "min-h-11 rounded-xl border border-sand bg-white px-3 text-base text-charcoal outline-none focus:border-clay focus:ring-4 focus:ring-clay/15";
const INPUT_CLASS = `${FIELD_CLASS} w-full`;
// The room and bed selects sit side by side in a flex row, so they size from
// flex-1 rather than w-full.
const SPLIT_CLASS = `${FIELD_CLASS} flex-1`;

// idPrefix keeps the label/input `for` pairs unique when two of these ever
// render on one page.
export function VisitFieldsForm({ fields, idPrefix }: { fields: VisitFields; idPrefix: string }) {
  const { lang } = useLanguage();
  const selectedMassage = fields.massages.find((m) => m.id === fields.treatmentId) ?? null;
  const durations = selectedMassage ? availableDurations(selectedMassage, 1) : [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor={`${idPrefix}Name`} className="mb-1.5 block text-sm font-semibold text-charcoal">
          {t("nameGuest", lang)}
        </label>
        <input
          id={`${idPrefix}Name`}
          type="text"
          value={fields.name}
          onChange={(e) => fields.setName(e.target.value)}
          placeholder={t("namePlaceholder", lang)}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}Treatment`} className="mb-1.5 block text-sm font-semibold text-charcoal">
          {t("treatment", lang)}
        </label>
        <select
          id={`${idPrefix}Treatment`}
          value={fields.treatmentId}
          disabled={fields.loading}
          onChange={(e) => fields.setTreatmentId(e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">—</option>
          {fields.massages.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {selectedMassage && (
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-charcoal">{t("durationHeading", lang)}</label>
          <div className="flex flex-wrap gap-2">
            {durations.map((d) => (
              <button
                key={d.minutes}
                type="button"
                onClick={() => fields.setMinutes(d.minutes)}
                className={`min-h-10 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                  fields.minutes === d.minutes
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

      {fields.therapists.length > 0 && (
        <div>
          <label htmlFor={`${idPrefix}Therapist`} className="mb-1.5 block text-sm font-semibold text-charcoal">
            {t("therapistLabel", lang)}
          </label>
          <select
            id={`${idPrefix}Therapist`}
            value={fields.therapistId}
            onChange={(e) => fields.setTherapistId(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">{t("therapistChoose", lang)}</option>
            {fields.therapists.map((th) => (
              <option key={th.id} value={th.id}>
                {th.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {fields.rooms.length > 0 && (
        <div>
          <label htmlFor={`${idPrefix}Room`} className="mb-1.5 block text-sm font-semibold text-charcoal">
            {t("roomLabel", lang)}
          </label>
          <div className="flex flex-wrap gap-2">
            <select
              id={`${idPrefix}Room`}
              value={fields.roomId}
              onChange={(e) => fields.setRoomId(e.target.value)}
              className={SPLIT_CLASS}
            >
              <option value="">{t("roomChoose", lang)}</option>
              {fields.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {fields.selectedRoom && fields.selectedRoom.beds.length > 0 && (
              <select
                id={`${idPrefix}Bed`}
                value={fields.bedId}
                onChange={(e) => fields.setBedId(e.target.value)}
                className={SPLIT_CLASS}
              >
                <option value="">{t("bedChoose", lang)}</option>
                {fields.selectedRoom.beds.map((b) => (
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
  );
}
