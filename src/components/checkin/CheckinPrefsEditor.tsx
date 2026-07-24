import type { ReactNode } from "react";
import { Check, Flame, MessageCircle, Music, VolumeX } from "lucide-react";
import { PreferenceCard } from "../PreferenceCard";
import { SegmentedControl } from "../SegmentedControl";
import { Toggle } from "../Toggle";
import { oils } from "../../data/oils";
import { zoneDefinitions } from "../../data/zones";
import {
  communicationTranslations,
  musicTranslations,
  oilNameTranslations,
  oilSubtitleTranslations,
  pillowTranslations,
  pressureTranslations,
  t,
  tZone,
} from "../../i18n/translations";
import type { StoredPreferences } from "../../lib/guestProfile";
import type {
  CommunicationStyle,
  LangCode,
  MusicPreference,
  PressureLevel,
  ZoneId,
} from "../../types";

// Standalone editor over the check-in flow's StoredPreferences shape (no
// GuestContext — this page runs on the guest's own phone, outside the kiosk's
// device-gated providers). Deliberately mirrors PreferencesStep's option
// lists. The comfort fields are always shown; the body-zone marks and
// zoneNotes/generalNote (GDPR Art. 9 health data — a mark alone counts, even
// with no text) are shown and editable ONLY when the `healthConsent` prop is
// true — CheckinPage now captures both consents itself before rendering this
// with a granted health consent, mirroring the kiosk's PreferencesStep.

const pressureOrder: PressureLevel[] = ["Lekki", "Średni", "Mocny", "Głęboki"];

const musicOptions: { value: MusicPreference; icon: ReactNode }[] = [
  { value: "nature", icon: <Music size={16} /> },
  { value: "ambient", icon: <Music size={16} /> },
  { value: "silence", icon: <VolumeX size={16} /> },
];

const communicationOptions: { value: CommunicationStyle; icon: ReactNode }[] = [
  { value: "silent", icon: <VolumeX size={18} /> },
  { value: "guided", icon: <MessageCircle size={18} /> },
];

// Reuses BodyMapStep's existing zone-mark vocabulary (zoneStandard/
// zonePriority/doNotMassageZone) rather than minting new i18n keys.
const zoneMarkOrder: { value: "standard" | "priority" | "blocked"; key: string }[] = [
  { value: "standard", key: "zoneStandard" },
  { value: "priority", key: "zonePriority" },
  { value: "blocked", key: "doNotMassageZone" },
];

export function CheckinPrefsEditor({
  value,
  onChange,
  lang,
  healthConsent,
}: {
  value: StoredPreferences;
  onChange: (next: StoredPreferences) => void;
  lang: LangCode;
  healthConsent: boolean;
}) {
  const setField = <K extends keyof StoredPreferences>(key: K, v: StoredPreferences[K]) =>
    onChange({ ...value, [key]: v });

  const setZone = (zoneId: ZoneId, mark: "standard" | "priority" | "blocked") => {
    const zones = { ...(value.zones ?? {}) };
    if (mark === "standard") delete zones[zoneId];
    else zones[zoneId] = mark;
    onChange({ ...value, zones });
  };

  const setZoneNote = (zoneId: ZoneId, note: string) => {
    const zoneNotes = { ...(value.zoneNotes ?? {}) };
    if (note.trim()) zoneNotes[zoneId] = note;
    else delete zoneNotes[zoneId];
    onChange({ ...value, zoneNotes });
  };

  // Phone screen, not the kiosk's visual body map — a guest reviewing/editing
  // here shouldn't have to scroll past a dozen "standard" zones to find the
  // few that matter. Only show a zone that's already marked priority/blocked
  // or already carries a note; unmarking + clearing its note drops it back
  // out of the list on the next render (value-derived, not frozen).
  const relevantZones = zoneDefinitions.filter((zone) => {
    const mark = value.zones?.[zone.id] ?? "standard";
    const hasNote = Boolean(value.zoneNotes?.[zone.id]?.trim());
    return mark !== "standard" || hasNote;
  });

  return (
    <div className="grid grid-cols-1 gap-5">
      <PreferenceCard title={t("pressureCardTitle", lang)} description={t("pressureCardDesc", lang)}>
        <SegmentedControl
          options={pressureOrder.map((v) => ({ value: v, label: pressureTranslations[v][lang] }))}
          value={value.pressure ?? "Średni"}
          onChange={(v) => setField("pressure", v)}
        />
      </PreferenceCard>

      <PreferenceCard title={t("massageOil", lang)} description={t("oilCardDesc", lang)}>
        <div className="grid grid-cols-2 gap-2.5">
          {oils.map((oil) => {
            const isSelected = value.oilId === oil.id;
            return (
              <button
                key={oil.id}
                type="button"
                onClick={() => setField("oilId", oil.id)}
                className={`relative min-h-16 rounded-xl border p-3 text-left transition-all duration-300 active:scale-[0.98] ${
                  isSelected
                    ? "border-clay bg-clay-tint shadow-soft"
                    : "border-sand bg-white hover:border-clay/40 hover:bg-oatmeal/60"
                }`}
              >
                {isSelected && (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-sage-dark text-cream">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
                <div className="pr-5 text-sm font-semibold text-charcoal">
                  {oilNameTranslations[oil.id]?.[lang] ?? oil.name}
                </div>
                <div className="text-xs text-slate-light">
                  {oilSubtitleTranslations[oil.id]?.[lang] ?? oil.subtitle}
                </div>
              </button>
            );
          })}
        </div>
      </PreferenceCard>

      <PreferenceCard title={t("tableWarming", lang)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-charcoal">
            <Flame size={18} className="text-clay-dark" />
            {value.tableWarming ? t("on", lang) : t("off", lang)}
          </div>
          <Toggle
            checked={value.tableWarming ?? false}
            onChange={(v) => setField("tableWarming", v)}
            label={t("tableWarming", lang)}
          />
        </div>

        <div className="my-4 h-px bg-sand" />

        <div className="mb-2 text-sm font-semibold text-charcoal">{t("headrestPillow", lang)}</div>
        <SegmentedControl
          options={[
            { value: "Standardowa", label: pillowTranslations["Standardowa"][lang] },
            { value: "Ultra-miękka", label: pillowTranslations["Ultra-miękka"][lang] },
          ]}
          value={value.headrestPillow ?? "Standardowa"}
          onChange={(v) => setField("headrestPillow", v)}
        />

        <div className="my-4 h-px bg-sand" />

        <div className="mb-2 text-sm font-semibold text-charcoal">{t("backgroundMusic", lang)}</div>
        <div className="flex flex-wrap gap-2">
          {musicOptions.map((opt) => {
            const isSelected = (value.music ?? "nature") === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setField("music", opt.value)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-all duration-300 active:scale-[0.98] ${
                  isSelected
                    ? "border-clay bg-clay-tint text-clay-dark"
                    : "border-sand bg-white text-slate hover:border-clay/40"
                }`}
              >
                {opt.icon}
                {musicTranslations[opt.value][lang]}
              </button>
            );
          })}
        </div>
      </PreferenceCard>

      <PreferenceCard title={t("communication", lang)}>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {communicationOptions.map((opt) => {
            const isSelected = (value.communication ?? "silent") === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setField("communication", opt.value)}
                className={`flex min-h-16 items-center gap-2 rounded-xl border p-4 text-left transition-all duration-300 active:scale-[0.98] ${
                  isSelected
                    ? "border-clay bg-clay-tint shadow-soft"
                    : "border-sand bg-white hover:border-clay/40 hover:bg-oatmeal/60"
                }`}
              >
                <span className={isSelected ? "text-clay-dark" : "text-slate-light"}>{opt.icon}</span>
                <span className="text-sm font-semibold text-charcoal">
                  {communicationTranslations[opt.value][lang]}
                </span>
              </button>
            );
          })}
        </div>
      </PreferenceCard>

      {healthConsent && relevantZones.length > 0 && (
        <PreferenceCard title={t("bodyZones", lang)} description={t("checkinZonesIntro", lang)}>
          <ul className="flex flex-col gap-2">
            {relevantZones.map((zone) => {
              const mark = value.zones?.[zone.id] ?? "standard";
              return (
                <li key={zone.id} className="rounded-xl border border-sand bg-white p-3">
                  <span className="mb-2 block text-sm font-medium text-charcoal">
                    {tZone(zone.id, lang)}
                  </span>
                  {/* Grid, not a single-row pill: the "Nie masować (strefa
                      wykluczona)" label is too long to fit three across on a
                      phone without wrapping — a fixed-width row overflowed the
                      card and got clipped by the viewport edge. */}
                  <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-sand bg-oatmeal/40 p-1">
                    {zoneMarkOrder.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setZone(zone.id, opt.value)}
                        className={`min-h-11 rounded-lg px-1.5 text-center text-[11px] font-semibold leading-tight transition-all duration-300 ${
                          mark === opt.value
                            ? "bg-clay text-white shadow-soft"
                            : "text-slate hover:bg-white"
                        }`}
                      >
                        {t(opt.key, lang)}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={value.zoneNotes?.[zone.id] ?? ""}
                    onChange={(e) => setZoneNote(zone.id, e.target.value)}
                    placeholder={t("zoneNotePlaceholder", lang)}
                    rows={2}
                    className="mt-2 w-full resize-none rounded-lg border border-sand bg-(--color-cream)/50 px-3 py-2 text-xs leading-relaxed text-charcoal placeholder:text-slate-light/70 outline-none transition-colors duration-200 focus:border-clay focus:ring-2 focus:ring-clay/15"
                  />
                </li>
              );
            })}
          </ul>
        </PreferenceCard>
      )}

      {healthConsent && (
        <PreferenceCard title={t("generalNoteLabel", lang)} description={t("generalNoteHelp", lang)}>
          <textarea
            value={value.generalNote ?? ""}
            onChange={(e) => setField("generalNote", e.target.value)}
            placeholder={t("generalNotePlaceholder", lang)}
            rows={4}
            className="w-full resize-none rounded-xl border border-sand bg-(--color-cream)/50 px-3.5 py-2.5 text-sm leading-relaxed text-charcoal placeholder:text-slate-light/70 outline-none transition-colors duration-200 focus:border-clay focus:ring-2 focus:ring-clay/15"
          />
        </PreferenceCard>
      )}
    </div>
  );
}
