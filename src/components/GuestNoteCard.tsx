import { useState } from "react";
import { Languages, LoaderCircle, TriangleAlert } from "lucide-react";
import { t, tZone, type LangCode } from "../i18n/translations";
import { isTranslatable, translateNote } from "../i18n/translateNote";

export function GuestNoteCard({ zoneId, note, lang }: { zoneId: string; note: string; lang: LangCode }) {
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = `${zoneId}:${lang}`;
  const translated = translations[cacheKey];
  const canTranslate = isTranslatable(lang);

  const handleTranslate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await translateNote(note, lang);
      setTranslations((prev) => ({ ...prev, [cacheKey]: result }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Translation failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-sand bg-oatmeal/50 px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-clay-dark">
          {tZone(zoneId, lang)}
        </div>
        {canTranslate && !translated && (
          <button
            type="button"
            onClick={handleTranslate}
            disabled={loading}
            className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-sand bg-white px-2.5 text-xs font-semibold text-slate transition-colors duration-200 hover:bg-oatmeal disabled:opacity-60"
          >
            {loading ? (
              <LoaderCircle size={13} className="animate-spin" />
            ) : (
              <Languages size={13} />
            )}
            {loading ? t("translating", lang) : t("translate", lang)}
          </button>
        )}
      </div>

      {translated ? (
        <>
          <div className="mt-0.5 text-sm text-charcoal">{translated}</div>
          <div className="mt-1.5 border-t border-sand/70 pt-1.5 text-xs text-slate-light">
            <span className="font-semibold">{t("original", lang)}:</span> {note}
          </div>
        </>
      ) : (
        <div className="mt-0.5 text-sm text-charcoal">{note}</div>
      )}

      {error && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-dark">
          <TriangleAlert size={13} className="shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
