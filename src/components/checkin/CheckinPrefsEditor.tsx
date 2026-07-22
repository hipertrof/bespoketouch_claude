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
// device-gated providers). Deliberately mirrors PreferencesStep's option lists
// and BodyMapStep's zone marks, but edits only the comfort-only subset the
// user agreed the phone flow may touch: zoneNotes/generalNote (free-text
// health data) are never shown or editable here.

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
}: {
  value: StoredPreferences;
  onChange: (next: StoredPreferences) => void;
  lang: LangCode;
}) {
  const setField = <K extends keyof StoredPreferences>(key: K, v: StoredPreferences[K]) =>
    onChange({ ...value, [key]: v });

  const setZone = (zoneId: ZoneId, mark: "standard" | "priority" | "blocked") => {
    const zones = { ...(value.zones ?? {}) };
    if (mark === "standard") delete zones[zoneId];
    else zones[zoneId] = mark;
    onChange({ ...value, zones });
  };

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

      <PreferenceCard title={t("bodyZones", lang)} description={t("checkinZonesIntro", lang)}>
        <ul className="flex flex-col gap-2">
          {zoneDefinitions.map((zone) => {
            const mark = value.zones?.[zone.id] ?? "standard";
            return (
              <li
                key={zone.id}
                className="flex flex-col gap-2 rounded-xl border border-sand bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium text-charcoal">{tZone(zone.id, lang)}</span>
                <div className="inline-flex self-start rounded-full border border-sand bg-oatmeal/40 p-1 sm:self-auto">
                  {zoneMarkOrder.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setZone(zone.id, opt.value)}
                      className={`min-h-9 rounded-full px-3 text-xs font-semibold transition-all duration-300 ${
                        mark === opt.value
                          ? "bg-clay text-white shadow-soft"
                          : "text-slate hover:bg-white"
                      }`}
                    >
                      {t(opt.key, lang)}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </PreferenceCard>
    </div>
  );
}
