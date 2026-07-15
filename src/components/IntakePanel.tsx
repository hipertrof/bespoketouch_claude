import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Droplet,
  Flame,
  Gauge,
  Globe,
  MessageSquareText,
  Moon,
  Music,
  Sparkles,
  Users,
  VolumeX,
} from "lucide-react";
import { StaticBodyMap } from "./BodyMap/StaticBodyMap";
import { GuestNoteCard } from "./GuestNoteCard";
import { formatPrice } from "../data/massageTypes";
import { oils } from "../data/oils";
import { guestDisplayName } from "../utils/guestName";
import type { PartySize, PersonalizationState } from "../types";
import type { TreatmentSnapshot } from "../lib/intakes";
import {
  communicationTranslations,
  languages,
  musicTranslations,
  oilNameTranslations,
  pillowTranslations,
  pressureTranslations,
  t,
  type LangCode,
} from "../i18n/translations";

// The therapist-facing summary of one visit, source-agnostic: fed either by the
// live kiosk session (MasseurDashboard) or a persisted intake row (queue). Every
// field it needs is captured here so it never touches the live offer or session.
export interface IntakePanelView {
  partySize: PartySize;
  separateTreatments: boolean;
  guestNames: string[];
  guests: PersonalizationState[];
  // Index-aligned with `guests`: the treatment snapshot each guest chose.
  treatments: TreatmentSnapshot[];
}

interface IntakePanelProps {
  view: IntakePanelView;
  // Language the summary opens in (independently switchable below).
  initialLang: LangCode;
  // Bottom-bar controls (kiosk: end session; queue: mark done / back). Given
  // the panel's current language so their labels track the language switch.
  actions?: (lang: LangCode) => ReactNode;
  // Small centered line under the card (kiosk: "locked by guest").
  footerNote?: (lang: LangCode) => ReactNode;
}

const pickName = (dict: Record<string, string> | null, lang: LangCode): string =>
  dict?.[lang] ?? dict?.pl ?? Object.values(dict ?? {})[0] ?? "";

export function IntakePanel({ view, initialLang, actions, footerNote }: IntakePanelProps) {
  // Seed from the given language, but keep it independently switchable here (an
  // Indonesian-speaking therapist can read an English guest's summary).
  const [lang, setLang] = useState<LangCode>(initialLang);
  const [selectedGuestIndex, setSelectedGuestIndex] = useState(0);

  const isCouple = view.partySize === 2;
  const activeGuest = view.guests[selectedGuestIndex] ?? view.guests[0];
  const { preferences } = activeGuest;

  const snapshot = view.treatments[selectedGuestIndex] ?? view.treatments[0];
  const hasTreatment = Boolean(snapshot?.treatmentId);
  const treatmentName = hasTreatment ? pickName(snapshot.nameI18n, lang) : null;
  const price = snapshot?.price != null ? formatPrice(snapshot.price) : null;

  const oil = oils.find((o) => o.id === preferences.oilId);
  const oilName = oil ? oilNameTranslations[oil.id]?.[lang] ?? oil.name : null;
  const zoneNoteEntries = useMemo(
    () =>
      Object.entries(activeGuest.zoneNotes).filter(
        ([, note]) => note && note.trim().length > 0,
      ) as [string, string][],
    [activeGuest.zoneNotes],
  );

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
            {guestDisplayName(view.guestNames, view.partySize)}
          </div>
        </div>
        <div className="hidden h-10 w-px bg-sand sm:block" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-light">
            {t("treatment", lang)}
          </div>
          <div className="text-xl font-semibold text-charcoal sm:text-2xl">
            {hasTreatment
              ? `${snapshot.minutes ?? "—"} min ${treatmentName}${price ? ` · ${price}` : ""}`
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
                {view.separateTreatments && (
                  <span className="rounded-full bg-clay-tint px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-clay-dark">
                    {t("differentTreatments", lang)}
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
              {view.guestNames[i]?.trim() || `${t("person", lang)} ${i + 1}`}
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
        {actions?.(lang)}
      </div>

      {footerNote?.(lang)}
    </div>
  );
}
