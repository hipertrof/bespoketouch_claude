import type { ReactNode } from "react";
import { Ban, Check, CheckCircle2, Star } from "lucide-react";
import type { LangCode, ZoneMark } from "../../types";
import { t } from "../../i18n/translations";
import type { MarkerPosition } from "./markerPositions";

interface ZonePopoverProps {
  position: MarkerPosition;
  label: string;
  current: ZoneMark;
  note: string;
  lang: LangCode;
  onSelect: (mark: ZoneMark) => void;
  onNoteChange: (note: string) => void;
  onClose: () => void;
}

const options: {
  mark: ZoneMark;
  titleKey: string;
  icon: ReactNode;
  tint: string;
  border: string;
}[] = [
  {
    mark: "priority",
    titleKey: "zonePriority",
    icon: <Star size={18} className="fill-clay-dark text-clay-dark" />,
    tint: "bg-clay-tint",
    border: "border-clay",
  },
  {
    mark: "standard",
    titleKey: "zoneStandard",
    icon: <CheckCircle2 size={18} className="text-sage-dark" />,
    tint: "bg-sage-tint",
    border: "border-sage",
  },
  {
    mark: "blocked",
    titleKey: "doNotMassage",
    icon: <Ban size={18} className="text-rose-dark" />,
    tint: "bg-rose-tint",
    border: "border-rose",
  },
];

export function ZonePopover({
  position,
  label,
  current,
  note,
  lang,
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
      className={`absolute z-30 w-72 -translate-x-1/2 ${
        showAbove ? "-translate-y-[calc(100%+1.5rem)]" : "translate-y-5"
      } ${alignRight ? "!left-auto !right-0 !translate-x-0" : ""} ${
        alignLeft ? "!left-0 !translate-x-0" : ""
      }`}
    >
      <div className="overflow-hidden rounded-3xl border border-sand bg-white shadow-lift">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <span className="text-sm font-semibold uppercase tracking-wide text-charcoal">
            {label}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-light transition-colors duration-200 hover:text-charcoal"
          >
            {t("close", lang)}
          </button>
        </div>

        <div className="flex flex-col gap-2.5 px-4 pb-2">
          {options.map((opt) => {
            const isSelected = current === opt.mark;
            return (
              <button
                key={opt.mark}
                type="button"
                onClick={() => onSelect(opt.mark)}
                aria-pressed={isSelected}
                className={`flex min-h-[3.25rem] items-center gap-3.5 rounded-2xl border-2 px-4 py-3 text-left transition-all duration-200 active:scale-[0.98] ${opt.tint} ${
                  isSelected
                    ? `${opt.border} shadow-soft`
                    : "border-transparent hover:brightness-[0.97]"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 shadow-soft">
                  {opt.icon}
                </span>
                <span className="flex-1 text-sm font-semibold uppercase tracking-wide text-charcoal">
                  {t(opt.titleKey, lang)}
                </span>
                {isSelected && (
                  <Check size={17} strokeWidth={2.5} className="shrink-0 text-charcoal/70" />
                )}
              </button>
            );
          })}
        </div>

        <div className="px-5 pt-3 pb-5">
          <label
            htmlFor="zoneNote"
            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-light"
          >
            {t("notes", lang)}
          </label>
          <textarea
            id="zoneNote"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={t("zoneNotePlaceholder", lang)}
            rows={2}
            className="w-full resize-none rounded-xl border border-sand bg-(--color-cream)/50 px-3.5 py-2.5 text-sm leading-relaxed text-charcoal placeholder:text-slate-light/70 outline-none transition-colors duration-200 focus:border-clay focus:ring-2 focus:ring-clay/15"
          />
          <button
            type="button"
            onClick={onClose}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-sage-dark text-sm font-semibold text-cream transition-all duration-200 active:scale-[0.98] hover:bg-sage"
          >
            <Check size={16} />
            {t("done", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
