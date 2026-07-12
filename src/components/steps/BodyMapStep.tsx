import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { Button } from "../Button";
import { BodySilhouette, figureAspectRatio } from "../BodyMap/BodySilhouette";
import { ZoneMarker } from "../BodyMap/ZoneMarker";
import { ZonePopover } from "../BodyMap/ZonePopover";
import { markersForView } from "../BodyMap/markerPositions";
import { zoneLabel } from "../../data/zones";
import type { BodyView, ZoneMark } from "../../types";

export function BodyMapStep() {
  const { state, dispatch } = useGuest();
  const [view, setView] = useState<BodyView>("front");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const markers = markersForView(view);

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
      <h1 className="mb-2 font-serif text-3xl text-charcoal sm:text-4xl">
        Obszary pracy
      </h1>
      <p className="mb-8 max-w-xl text-base leading-relaxed text-slate">
        Zaznacz obszary ciała, na których chcieliby Państwo się skupić podczas
        masażu.
      </p>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="mb-5 inline-flex rounded-full border border-sand bg-white p-1 shadow-soft">
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
                {v === "front" ? "Przód" : "Tył"}
              </button>
            ))}
          </div>

          <div
            style={{ aspectRatio: figureAspectRatio(state.bodyGender) }}
            className="relative mx-auto w-full max-w-64 select-none rounded-3xl border border-sand/60 bg-white/60 p-6 shadow-soft sm:max-w-72"
            onClick={(e) => {
              if (e.target === e.currentTarget) setActiveIndex(null);
            }}
          >
            <BodySilhouette view={view} gender={state.bodyGender} />
            {markers.map((marker, index) => (
              <ZoneMarker
                key={`${marker.zoneId}-${index}`}
                position={marker}
                label={zoneLabel(marker.zoneId)}
                mark={state.zones[marker.zoneId] ?? "standard"}
                isActive={activeIndex === index}
                onToggle={() => handleToggle(index)}
              />
            ))}
            {activeIndex !== null && (
              <ZonePopover
                position={markers[activeIndex]}
                label={zoneLabel(markers[activeIndex].zoneId)}
                current={state.zones[markers[activeIndex].zoneId] ?? "standard"}
                note={state.zoneNotes[markers[activeIndex].zoneId] ?? ""}
                onSelect={handleSelect}
                onNoteChange={handleNoteChange}
                onClose={() => setActiveIndex(null)}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:w-56 lg:pt-16">
          <div className="rounded-2xl border border-sand bg-white p-4 shadow-soft">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-light">
              Legenda
            </h3>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="h-5 w-5 shrink-0 rounded-full border-2 border-clay-dark bg-clay" />
                <div className="text-sm">
                  <div className="font-medium text-charcoal">Obszar priorytetowy</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="h-5 w-5 shrink-0 rounded-full border-2 border-rose-dark bg-rose" />
                <div className="text-sm">
                  <div className="font-medium text-charcoal">Nie masować</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="h-5 w-5 shrink-0 rounded-full border-2 border-slate-light/50 bg-white/70" />
                <div className="text-sm">
                  <div className="font-medium text-charcoal">Standardowy</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 flex flex-col-reverse justify-between gap-3 sm:flex-row">
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: "SET_STEP", step: "staffHandoff" })}
        >
          <ArrowLeft size={18} />
          Wstecz
        </Button>
        <Button onClick={() => dispatch({ type: "SET_STEP", step: "preferences" })}>
          Zapisz i kontynuuj
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}
