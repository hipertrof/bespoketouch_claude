import { LOGO } from "./logoPath";
import { t } from "../i18n/translations";
import type { LangCode } from "../types";

function LogoMark({ className }: { className: string }) {
  return (
    <svg
      viewBox={`0 0 ${LOGO.w} ${LOGO.h}`}
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <circle cx={LOGO.circle.cx} cy={LOGO.circle.cy} r={LOGO.circle.r} className="fill-clay-light" />
      <path d={LOGO.d} fillRule="evenodd" className="fill-charcoal" />
    </svg>
  );
}

export function Logo({
  compact = false,
  lang = "pl",
  logoUrl = null,
}: {
  compact?: boolean;
  lang?: LangCode;
  // Per-location branding: a client logo replaces the mark + wordmark, keeping
  // a small "powered by BespokeTouch" credit. Null = stock rendering.
  logoUrl?: string | null;
}) {
  if (logoUrl && !compact) {
    return (
      <div className="flex flex-col gap-0.5">
        <img src={logoUrl} alt="" className="h-12 w-auto max-w-[180px] object-contain sm:h-14" />
        <div className="text-[9px] font-medium lowercase tracking-[0.2em] text-slate-light">
          powered by BespokeTouch
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 sm:gap-3.5">
      <LogoMark className={compact ? "h-11 w-11 sm:h-12 sm:w-12" : "h-14 w-14 sm:h-16 sm:w-16"} />
      {!compact && (
        <div className="leading-tight">
          <div className="text-[9px] font-medium lowercase tracking-[0.2em] text-slate-light">
            powered by
          </div>
          <div className="font-serif text-xl font-semibold tracking-tight text-charcoal sm:text-2xl">
            BespokeTouch
          </div>
          <div className="hidden text-[11px] font-medium uppercase tracking-[0.16em] text-slate-light min-[360px]:block sm:text-xs">
            {t("tagline", lang)}
          </div>
        </div>
      )}
    </div>
  );
}
