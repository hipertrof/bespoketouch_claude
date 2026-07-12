import type { ReactNode } from "react";
import { Ban, Check, Circle, Star } from "lucide-react";
import type { ZoneMark } from "../../types";
import type { MarkerPosition } from "./markerPositions";

interface ZonePopoverProps {
  position: MarkerPosition;
  label: string;
  current: ZoneMark;
  note: string;
  onSelect: (mark: ZoneMark) => void;
  onNoteChange: (note: string) => void;
  onClose: () => void;
}

const options: {
  mark: ZoneMark;
  title: string;
  subtitle: string;
  icon: ReactNode;
  activeClasses: string;
}[] = [
  {
    mark: "priority",
    title: "Obszar priorytetowy",
    subtitle: "Skup się na tym obszarze",
    icon: <Star size={16} className="fill-clay-dark text-clay-dark" />,
    activeClasses: "border-clay bg-clay-tint",
  },
  {
    mark: "standard",
    title: "Standardowy",
    subtitle: "Standardowa uwaga",
    icon: <Circle size={16} className="text-slate-light" />,
    activeClasses: "border-slate-light bg-oatmeal",
  },
  {
    mark: "blocked",
    title: "Nie masować",
    subtitle: "Pomiń ten obszar",
    icon: <Ban size={16} className="text-rose-dark" />,
    activeClasses: "border-rose bg-rose-tint",
  },
];

export function ZonePopover({
  position,
  label,
  current,
  note,
  onSelect,
  onNoteChange,
  onClose,
}: ZonePopoverProps) {
  const showAbove = position.top > 55;
  const alignRight = position.left > 65;
  const alignLeft = position.left < 35;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        left: `${position.left}%`,
        top: `${position.top}%`,
      }}
      className={`absolute z-30 w-64 -translate-x-1/2 ${
        showAbove ? "-translate-y-[calc(100%+1.5rem)]" : "translate-y-5"
      } ${alignRight ? "!left-auto !right-0 !translate-x-0" : ""} ${
        alignLeft ? "!left-0 !translate-x-0" : ""
      }`}
    >
      <div className="overflow-hidden rounded-2xl border border-sand bg-white shadow-lift">
        <div className="border-b border-sand/70 bg-oatmeal/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate">
          {label}
        </div>
        <div className="flex flex-col gap-1.5 p-2">
          {options.map((opt) => {
            const isSelected = current === opt.mark;
            return (
              <button
                key={opt.mark}
                type="button"
                onClick={() => onSelect(opt.mark)}
                className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all duration-200 active:scale-[0.98] ${
                  isSelected
                    ? opt.activeClasses
                    : "border-transparent hover:bg-oatmeal"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-soft">
                  {opt.icon}
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-charcoal">
                    {opt.title}
                  </span>
                  <span className="text-xs text-slate-light">{opt.subtitle}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="border-t border-sand/70 p-3">
          <label
            htmlFor="zoneNote"
            className="mb-1.5 block text-xs font-semibold text-slate"
          >
            Dodaj uwagi
          </label>
          <textarea
            id="zoneNote"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="np. blizna, wrażliwa skóra…"
            rows={2}
            className="w-full resize-none rounded-lg border border-sand bg-cream/50 px-2.5 py-2 text-sm text-charcoal placeholder:text-slate-light/70 outline-none transition-colors duration-200 focus:border-clay focus:ring-2 focus:ring-clay/15"
          />
          <button
            type="button"
            onClick={onClose}
            className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-sage-dark text-sm font-semibold text-cream transition-all duration-200 active:scale-[0.98]"
          >
            <Check size={15} />
            Gotowe
          </button>
        </div>
      </div>
    </div>
  );
}
