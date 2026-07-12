import { LOGO } from "./logoPath";

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

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 sm:gap-3.5">
      <LogoMark className={compact ? "h-11 w-11 sm:h-12 sm:w-12" : "h-14 w-14 sm:h-16 sm:w-16"} />
      {!compact && (
        <div className="hidden leading-tight min-[420px]:block">
          <div className="font-serif text-xl font-semibold tracking-tight text-charcoal sm:text-2xl">
            BespokeTouch
          </div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-light sm:text-xs">
            Luksusowe Doświadczenia Spa
          </div>
        </div>
      )}
    </div>
  );
}
