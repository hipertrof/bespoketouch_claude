import type { BodyGender, BodyView, PersonalizationState, ZoneMark } from "../../types";
import { BodySilhouette, figureAspectRatio } from "./BodySilhouette";
import { markersForView } from "./markerPositions";
import { t, tZone, type LangCode } from "../../i18n/translations";

const dotClasses: Record<Exclude<ZoneMark, "standard">, string> = {
  priority: "bg-clay/70 ring-4 ring-clay/25",
  blocked: "bg-rose/70 ring-4 ring-rose/25",
};

export function StaticBodyMap({
  view,
  gender,
  zones,
  lang = "pl",
}: {
  view: BodyView;
  gender: BodyGender;
  zones: PersonalizationState["zones"];
  lang?: LangCode;
}) {
  const markers = markersForView(view).filter((m) => {
    const mark = zones[m.zoneId];
    return mark === "priority" || mark === "blocked";
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-light">
        {view === "front" ? t("front", lang) : t("back", lang)}
      </span>
      <div
        style={{ aspectRatio: figureAspectRatio(gender) }}
        className="relative w-full max-w-36"
      >
        <BodySilhouette view={view} gender={gender} />
        {markers.map((marker, index) => {
          const mark = zones[marker.zoneId] as Exclude<ZoneMark, "standard">;
          return (
            <span
              key={`${marker.zoneId}-${index}`}
              title={tZone(marker.zoneId, lang)}
              style={{ left: `${marker.left}%`, top: `${marker.top}%` }}
              className={`absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full ${dotClasses[mark]}`}
            />
          );
        })}
      </div>
    </div>
  );
}
