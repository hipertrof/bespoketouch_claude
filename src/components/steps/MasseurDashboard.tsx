import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Droplet,
  Flame,
  Gauge,
  Globe,
  MessageSquareText,
  Moon,
  Music,
  RotateCcw,
  Sparkles,
  Users,
  VolumeX,
} from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { Button } from "../Button";
import { StaticBodyMap } from "../BodyMap/StaticBodyMap";
import { GuestNoteCard } from "../GuestNoteCard";
import { massageTypes, durationPrice, formatPrice } from "../../data/massageTypes";
import { oils } from "../../data/oils";
import { guestDisplayName } from "../../utils/guestName";
import {
  communicationTranslations,
  languages,
  massageNameTranslations,
  musicTranslations,
  oilNameTranslations,
  pillowTranslations,
  pressureTranslations,
  t,
  type LangCode,
} from "../../i18n/translations";

export function MasseurDashboard() {
  const { state, dispatch } = useGuest();
  const [lang, setLang] = useState<LangCode>("pl");
  const [selectedGuestIndex, setSelectedGuestIndex] = useState(0);

  const isCouple = state.partySize === 2;
  const activeGuest = state.guests[selectedGuestIndex] ?? state.guests[0];
  const { preferences } = activeGuest;

  const currentSelection = state.treatmentSelections[selectedGuestIndex] ?? state.treatmentSelections[0];
  const treatment = massageTypes.find((m) => m.id === currentSelection?.treatmentId);
  const treatmentDuration = treatment?.durations.find(
    (d) => d.minutes === currentSelection?.treatmentMinutes,
  );
  const price =
    treatmentDuration && durationPrice(treatmentDuration, state.partySize) !== undefined
      ? formatPrice(durationPrice(treatmentDuration, state.partySize)!)
      : null;
  const oil = oils.find((o) => o.id === preferences.oilId);
  const zoneNoteEntries = Object.entries(activeGuest.zoneNotes).filter(
    ([, note]) => note && note.trim().length > 0,
  ) as [string, string][];

  const treatmentName = treatment ? massageNameTranslations[treatment.id]?.[lang] ?? treatment.name : null;
  const oilName = oil ? oilNameTranslations[oil.id]?.[lang] ?? oil.name : null;

  const summaryItems = [
    {
      icon: <Gauge size={20} />,
      label: t("pressure", lang),
      value: pressureTranslations[preferences.pressure][lang],
    },
    {
      icon: <Droplet size={20} />,
      label: t("massageOil", lang),
      value: oilName ?? "—",
    },
    {
      icon: preferences.communication === "silent" ? <VolumeX size={20} /> : <Sparkles size={20} />,
      label: t("communication", lang),
      value: communicationTranslations[preferences.communication][lang],
    },
    {
      icon: <Flame size={20} />,
      label: t("tableWarming", lang),
      value: preferences.tableWarming ? t("on", lang) : t("off", lang),
    },
    {
      icon: <Moon size={20} />,
      label: t("headrestPillow", lang),
      value: pillowTranslations[preferences.headrestPillow]?.[lang] ?? preferences.headrestPillow,
    },
    {
      icon: <Music size={20} />,
      label: t("backgroundMusic", lang),
      value: musicTranslations[preferences.music][lang],
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-sand bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:gap-10 sm:p-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-light">
            {t("guest", lang)}
          </div>
          <div className="text-xl font-semibold text-charcoal sm:text-2xl">
            {guestDisplayName(state.guestNames, state.partySize)}
          </div>
        </div>
        <div className="hidden h-10 w-px bg-sand sm:block" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-light">
            {t("treatment", lang)}
          </div>
          <div className="text-xl font-semibold text-charcoal sm:text-2xl">
            {treatment
              ? `${currentSelection?.treatmentMinutes ?? "—"} min ${treatmentName}${price ? ` · ${price}` : ""}`
              : "—"}
          </div>
        </div>
        {isCouple && (
          <>
            <div className="hidden h-10 w-px bg-sand sm:block" />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-light">
                {t("partySize", lang)}
              </div>
              <div className="flex items-center gap-1.5 text-xl font-semibold text-charcoal sm:text-2xl">
                <Users size={18} className="text-slate-light" />2
                {state.separateTreatments && (
                  <span className="rounded-full bg-clay-tint px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-clay-dark">
                    Różne zabiegi
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-2 sm:ml-auto">
          <Globe size={16} className="shrink-0 text-slate-light" />
          <div className="inline-flex flex-wrap gap-1 rounded-full border border-sand bg-oatmeal/40 p-1">
            {languages.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                aria-label={l.label}
                title={l.label}
                className={`min-h-9 rounded-full px-3 text-xs font-semibold uppercase transition-all duration-200 ${
                  lang === l.code
                    ? "bg-sage-dark text-cream"
                    : "text-slate hover:bg-oatmeal"
                }`}
              >
                {l.code}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isCouple && (
        <div className="mb-6 inline-flex rounded-full border border-sand bg-white p-1 shadow-soft">
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedGuestIndex(i)}
              className={`min-h-10 rounded-full px-5 text-sm font-semibold transition-all duration-300 ${
                selectedGuestIndex === i
                  ? "bg-sage-dark text-cream shadow-soft"
                  : "text-slate hover:bg-oatmeal"
              }`}
            >
              {state.guestNames[i]?.trim() || `${t("person", lang)} ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft sm:p-6">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-light">
            {t("bodyZones", lang)}
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <StaticBodyMap view="front" gender={activeGuest.bodyGender} zones={activeGuest.zones} lang={lang} />
            <StaticBodyMap view="back" gender={activeGuest.bodyGender} zones={activeGuest.zones} lang={lang} />
          </div>
          <div className="mt-6 flex flex-col gap-2.5 border-t border-sand pt-5">
            <div className="flex items-center gap-2.5">
              <span className="h-4 w-4 shrink-0 rounded-full bg-rose/70 ring-4 ring-rose/25" />
              <div className="text-sm">
                <span className="font-semibold text-charcoal">{t("excludedZones", lang)}</span>
                <span className="ml-1.5 text-slate-light">— {t("doNotMassage", lang)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="h-4 w-4 shrink-0 rounded-full bg-clay/70 ring-4 ring-clay/25" />
              <div className="text-sm">
                <span className="font-semibold text-charcoal">{t("priorityZones", lang)}</span>
                <span className="ml-1.5 text-slate-light">— {t("focusHere", lang)}</span>
              </div>
            </div>
          </div>

          {(zoneNoteEntries.length > 0 || activeGuest.generalNote.trim().length > 0) && (
            <div className="mt-5 border-t border-sand pt-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-light">
                <MessageSquareText size={14} />
                {t("guestNotes", lang)}
              </h3>
              <div className="flex flex-col gap-2.5">
                {activeGuest.generalNote.trim().length > 0 && (
                  <GuestNoteCard
                    title={t("additionalNotes", lang)}
                    note={activeGuest.generalNote}
                    lang={lang}
                  />
                )}
                {zoneNoteEntries.map(([zoneId, note]) => (
                  <GuestNoteCard key={zoneId} zoneId={zoneId} note={note} lang={lang} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft sm:p-6">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-light">
            {t("guestPreferences", lang)}
          </h2>
          <div className="flex flex-col divide-y divide-sand/70">
            {summaryItems.map((item) => (
              <div key={item.label} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-oatmeal text-sage-dark">
                  {item.icon}
                </span>
                <span className="flex-1 text-sm font-medium text-slate">
                  {item.label}
                </span>
                <span className="text-lg font-semibold text-charcoal">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-start gap-4 rounded-2xl border border-sand bg-oatmeal/60 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-clay-dark" />
          <div>
            <div className="text-sm font-semibold text-charcoal">
              {t("importantWarning", lang)}
            </div>
            <div className="text-sm text-slate-light">{t("warningBody", lang)}</div>
          </div>
        </div>
        <Button
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={() => dispatch({ type: "RESET_SESSION" })}
        >
          <RotateCcw size={18} />
          {t("endSession", lang)}
        </Button>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-light">
        <CheckCircle2 size={14} />
        {t("lockedByGuest", lang)}
      </div>
    </div>
  );
}
