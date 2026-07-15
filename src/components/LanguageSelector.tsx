import { Globe } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { languages, t } from "../i18n/translations";
import type { LangCode } from "../types";

// Global language dropdown for the staff surfaces outside the kiosk (login,
// offer CMS). Mirrors the kiosk Header's selector but is driven by the global
// LanguageContext instead of GuestContext.
export function LanguageSelector() {
  const { lang, setLang } = useLanguage();
  return (
    <label className="relative flex items-center gap-1.5 rounded-full border border-sand bg-white px-3 py-1.5 shadow-soft">
      <Globe size={15} className="shrink-0 text-slate-light" />
      <span className="sr-only">{t("language", lang)}</span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as LangCode)}
        className="cursor-pointer appearance-none bg-transparent pr-4 text-sm font-semibold text-charcoal outline-none"
        aria-label={t("language", lang)}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-3 h-2.5 w-2.5 text-slate-light"
      >
        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    </label>
  );
}
