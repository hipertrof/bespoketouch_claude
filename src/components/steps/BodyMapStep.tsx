import { useState } from "react";
import { ArrowLeft, ArrowRight, Ban, MessageSquareText, Star } from "lucide-react";
import { useGuest, useActiveGuest } from "../../context/GuestContext";
import { Button } from "../Button";
import { BodySilhouette, figureAspectRatio } from "../BodyMap/BodySilhouette";
import { ZoneMarker } from "../BodyMap/ZoneMarker";
import { ZonePopover } from "../BodyMap/ZonePopover";
import { markersForView } from "../BodyMap/markerPositions";
import { t, tZone } from "../../i18n/translations";
import type { BodyView, ZoneId, ZoneMark } from "../../types";

function ZoneChipWithNote({ label, note }: { label: string; note?: string }) {
  const trimmed = note?.trim();
  return (
    <div className="rounded-lg bg-white px-3 py-2 shadow-soft">
      <div className="text-sm font-medium text-charcoal">{label}</div>
      {trimmed && (
        <div className="mt-0.5 text-xs leading-relaxed text-slate-light">{trimmed}</div>
      )}
    </div>
  );
}

export function BodyMapStep() {
  const { state, dispatch } = useGuest();
  const lang = state.language;
  const activeGuest = useActiveGuest();
  const [view, setView] = useState<BodyView>("front");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const isCouple = state.partySize === 2;
  const markers = markersForView(view);

  const zonesByMark = (mark: ZoneMark): ZoneId[] =>
    (Object.entries(activeGuest.zones) as [ZoneId, ZoneMark][])
      .filter(([, m]) => m === mark)
      .map(([id]) => id);

  const priorityZones = zonesByMark("priority");
  const blockedZones = zonesByMark("blocked");

  // Zones that only have a note attached (mark left at "standard") — without
  // this, a comment-only zone never shows up anywhere in the summary.
  const notedStandardZones = (Object.keys(activeGuest.zoneNotes) as ZoneId[]).filter((id) => {
    const note = activeGuest.zoneNotes[id]?.trim();
    if (!note) return false;
    const mark = activeGuest.zones[id] ?? "standard";
    return mark !== "priority" && mark !== "blocked";
  });

  const hasSelection =
    priorityZones.length > 0 || blockedZones.length > 0 || notedStandardZones.length > 0;

  const handleToggle = (index: number) => {
    setActiveIndex((prev) => (prev === index ? null : index));
  };

  const handleSelect = (mark: ZoneMark) => {
    if (activeIndex === null) return;
    const marker = markers[activeIndex];
    dispatch({ type: "SET_ZONE_MARK", zoneId: marker.zoneId, mark });
  };

  const handleNoteChange = (note: string) => {
    if (activeIndex === null) return;
    const marker = markers[activeIndex];
    dispatch({ type: "SET_ZONE_NOTE", zoneId: marker.zoneId, note });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      {isCouple && (
        <span className="mb-3 inline-flex items-center rounded-full bg-sage-tint px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sage-dark">
          {state.guestNames[state.activeGuestIndex]?.trim() ||
            `${t("person", lang)} ${state.activeGuestIndex + 1}`}
        </span>
      )}
      <h1 className="mb-2 font-serif text-3xl text-charcoal sm:text-4xl">
        {t("workAreasTitle", lang)}
      </h1>
      <p className="mb-8 max-w-xl text-base leading-relaxed text-slate">
        {t("workAreasIntro", lang)}
      </p>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full border border-sand bg-white p-1 shadow-soft">
              {(["front", "back"] as BodyView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setView(v);
                    setActiveIndex(null);
                  }}
                  className={`min-h-11 rounded-full px-6 text-sm font-semibold transition-all duration-300 ${
                    view === v
                      ? "bg-sage-dark text-cream shadow-soft"
                      : "text-slate hover:bg-oatmeal"
                  }`}
                >
                  {v === "front" ? t("front", lang) : t("back", lang)}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{ aspectRatio: figureAspectRatio(activeGuest.bodyGender) }}
            className="relative mx-auto w-full max-w-64 select-none rounded-3xl border border-sand/60 bg-white/60 p-6 shadow-soft sm:max-w-72"
            onClick={(e) => {
              if (e.target === e.currentTarget) setActiveIndex(null);
            }}
          >
            <BodySilhouette view={view} gender={activeGuest.bodyGender} />
            {markers.map((marker, index) => (
              <ZoneMarker
                key={`${marker.zoneId}-${index}`}
                position={marker}
                label={tZone(marker.zoneId, lang)}
                mark={activeGuest.zones[marker.zoneId] ?? "standard"}
                isActive={activeIndex === index}
                onToggle={() => handleToggle(index)}
              />
            ))}
            {activeIndex !== null && (
              <ZonePopover
                position={markers[activeIndex]}
                label={tZone(markers[activeIndex].zoneId, lang)}
                current={activeGuest.zones[markers[activeIndex].zoneId] ?? "standard"}
                note={activeGuest.zoneNotes[markers[activeIndex].zoneId] ?? ""}
                lang={lang}
                onSelect={handleSelect}
                onNoteChange={handleNoteChange}
                onClose={() => setActiveIndex(null)}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-light">
            {t("selectedZonesHeading", lang)}
          </h2>

          {!hasSelection && (
            <div className="rounded-2xl border border-dashed border-sand bg-white/50 px-4 py-6 text-center text-sm leading-relaxed text-slate-light">
              {t("noZonesSelected", lang)}
            </div>
          )}

          {priorityZones.length > 0 && (
            <div className="rounded-2xl border border-clay/40 bg-clay-tint/50 p-4">
              <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-clay-dark">
                <Star size={13} className="fill-clay-dark" />
                {t("intensiveWork", lang)}
              </h3>
              <div className="flex flex-col gap-2">
                {priorityZones.map((id) => (
                  <ZoneChipWithNote key={id} label={tZone(id, lang)} note={activeGuest.zoneNotes[id]} />
                ))}
              </div>
            </div>
          )}

          {blockedZones.length > 0 && (
            <div className="rounded-2xl border border-rose/40 bg-rose-tint/50 p-4">
              <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-dark">
                <Ban size={13} />
                {t("doNotMassageZone", lang)}
              </h3>
              <div className="flex flex-col gap-2">
                {blockedZones.map((id) => (
                  <ZoneChipWithNote key={id} label={tZone(id, lang)} note={activeGuest.zoneNotes[id]} />
                ))}
              </div>
            </div>
          )}

          {notedStandardZones.length > 0 && (
            <div className="rounded-2xl border border-sage/40 bg-sage-tint/50 p-4">
              <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sage-dark">
                <MessageSquareText size={13} />
                {t("notesOtherZones", lang)}
              </h3>
              <div className="flex flex-col gap-2">
                {notedStandardZones.map((id) => (
                  <ZoneChipWithNote key={id} label={tZone(id, lang)} note={activeGuest.zoneNotes[id]} />
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-sand bg-white p-4 shadow-soft">
            <label
              htmlFor="generalNote"
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate"
            >
              <MessageSquareText size={14} className="text-slate-light" />
              {t("generalNoteLabel", lang)}
            </label>
            <p className="mt-1 mb-2.5 text-xs leading-relaxed text-slate-light">
              {t("generalNoteHelp", lang)}
            </p>
            <textarea
              id="generalNote"
              value={activeGuest.generalNote}
              onChange={(e) =>
                dispatch({ type: "SET_GENERAL_NOTE", note: e.target.value })
              }
              placeholder={t("generalNotePlaceholder", lang)}
              rows={4}
              className="w-full resize-none rounded-xl border border-sand bg-(--color-cream)/50 px-3.5 py-2.5 text-sm leading-relaxed text-charcoal placeholder:text-slate-light/70 outline-none transition-colors duration-200 focus:border-clay focus:ring-2 focus:ring-clay/15"
            />
          </div>
        </div>
      </div>

      <div className="mt-10 flex flex-col-reverse justify-between gap-3 sm:flex-row">
        <Button
          variant="secondary"
          onClick={() =>
            dispatch({
              type: "SET_STEP",
              step: isCouple && state.activeGuestIndex === 1 ? "guestHandoff" : "staffHandoff",
            })
          }
        >
          <ArrowLeft size={18} />
          {t("backButton", lang)}
        </Button>
        <Button onClick={() => dispatch({ type: "SET_STEP", step: "preferences" })}>
          {t("saveContinue", lang)}
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}
