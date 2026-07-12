import { Ban, Star } from "lucide-react";
import type { ZoneMark } from "../../types";
import type { MarkerPosition } from "./markerPositions";

interface ZoneMarkerProps {
  position: MarkerPosition;
  label: string;
  mark: ZoneMark;
  isActive: boolean;
  onToggle: () => void;
}

const markStyles: Record<ZoneMark, string> = {
  standard:
    "bg-white/70 border-slate-light/50 hover:border-clay hover:bg-clay-tint/60",
  priority: "bg-clay border-clay-dark shadow-[0_0_0_6px_rgba(201,154,106,0.25)]",
  blocked: "bg-rose border-rose-dark shadow-[0_0_0_6px_rgba(182,84,79,0.25)]",
};

export function ZoneMarker({ position, label, mark, isActive, onToggle }: ZoneMarkerProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={isActive}
      style={{ left: `${position.left}%`, top: `${position.top}%` }}
      className="absolute z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300 sm:h-9 sm:w-9 ${
          markStyles[mark]
        } ${isActive ? "ring-4 ring-sage/30" : ""}`}
      >
        {mark === "priority" && <Star size={14} className="fill-white text-white" />}
        {mark === "blocked" && <Ban size={14} className="text-white" />}
      </span>
    </button>
  );
}
