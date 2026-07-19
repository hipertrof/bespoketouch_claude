import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  brandCssVars,
  STOCK_PRIMARY,
  STOCK_SECONDARY,
  type LocationBranding,
} from "../../lib/branding";
import { useLanguage } from "../../context/LanguageContext";
import { t } from "../../i18n/translations";
import { Button } from "../Button";
import { Logo } from "../Logo";

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};
const MAX_BYTES = 1_048_576; // mirrors the bucket's server-side cap

// Per-location kiosk branding editor (logo + two accent colors), mounted in
// /manage under the location picker. Reads/writes location_settings.branding
// directly under RLS (can_manage_location); the logo goes to the public
// "branding" Storage bucket at <location_id>/logo-<ts>.<ext> — a fresh
// filename per upload so CDN caching never serves a stale logo.
export function BrandingEditor({ locationId }: { locationId: string }) {
  const { lang } = useLanguage();
  const [draft, setDraft] = useState<LocationBranding>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    setSaved(false);
    setDraft({});
    supabase
      .from("location_settings")
      .select("branding")
      .eq("location_id", locationId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setDraft(((data?.branding as LocationBranding | null) ?? {}) as LocationBranding);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  function update(patch: Partial<LocationBranding>) {
    setSaved(false);
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleFile(file: File) {
    setError(null);
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      setError(t("brandingInvalidType", lang));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t("brandingTooLarge", lang));
      return;
    }
    setBusy(true);
    try {
      const path = `${locationId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      // Best-effort: drop the previous object so the bucket doesn't accumulate.
      if (draft.logoPath) {
        await supabase.storage.from("branding").remove([draft.logoPath]).catch(() => {});
      }
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      update({ logoPath: path, logoUrl: data.publicUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeLogo() {
    setBusy(true);
    setError(null);
    if (draft.logoPath) {
      await supabase.storage.from("branding").remove([draft.logoPath]).catch(() => {});
    }
    setDraft((prev) => {
      const { logoPath: _p, logoUrl: _u, ...rest } = prev;
      return rest;
    });
    setSaved(false);
    setBusy(false);
  }

  async function persist(branding: LocationBranding) {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("location_settings")
      .upsert({ location_id: locationId, branding }, { onConflict: "location_id" });
    setBusy(false);
    if (error) setError(error.message);
    else setSaved(true);
  }

  async function save() {
    const branding: LocationBranding = { ...draft, version: 1 };
    // Stock-valued colors are omitted rather than stored, so "back to default"
    // needs no special casing on the kiosk.
    if (!branding.primary || branding.primary.toLowerCase() === STOCK_PRIMARY) delete branding.primary;
    if (!branding.secondary || branding.secondary.toLowerCase() === STOCK_SECONDARY) delete branding.secondary;
    if (!branding.primary && !branding.secondary && !branding.logoUrl) {
      await persist({});
      setDraft({});
      return;
    }
    await persist(branding);
    setDraft(branding);
  }

  async function reset() {
    if (draft.logoPath) {
      await supabase.storage.from("branding").remove([draft.logoPath]).catch(() => {});
    }
    setDraft({});
    await persist({});
  }

  if (!loaded) return null;

  return (
    <div className="mb-6 rounded-3xl bg-white p-6 shadow-soft">
      <h2 className="font-serif text-xl text-charcoal">{t("brandingTitle", lang)}</h2>
      <p className="mt-1 mb-4 text-sm text-slate">{t("brandingIntro", lang)}</p>

      <div className="flex flex-wrap items-start gap-6">
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("brandingPrimary", lang)}
          <input
            type="color"
            value={draft.primary ?? STOCK_PRIMARY}
            onChange={(e) => update({ primary: e.target.value })}
            className="h-11 w-20 cursor-pointer rounded-xl border border-sand bg-cream"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("brandingSecondary", lang)}
          <input
            type="color"
            value={draft.secondary ?? STOCK_SECONDARY}
            onChange={(e) => update({ secondary: e.target.value })}
            className="h-11 w-20 cursor-pointer rounded-xl border border-sand bg-cream"
          />
        </label>

        <div className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("brandingLogo", lang)}
          <div className="flex items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept={Object.keys(ALLOWED_TYPES).join(",")}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {draft.logoUrl ? t("brandingReplace", lang) : t("brandingUpload", lang)}
            </Button>
            {draft.logoUrl && (
              <button
                type="button"
                onClick={removeLogo}
                disabled={busy}
                className="text-sm text-rose-dark hover:underline"
              >
                {t("brandingRemoveLogo", lang)}
              </button>
            )}
          </div>
          <span className="normal-case tracking-normal text-slate-light">
            {t("brandingLogoHint", lang)}
          </span>
        </div>
      </div>

      {/* WYSIWYG preview: same brandCssVars() the kiosk root uses. */}
      <div className="mt-5">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("brandingPreview", lang)}
        </div>
        <div
          style={brandCssVars(draft)}
          className="flex flex-wrap items-center gap-4 rounded-2xl border border-sand bg-cream p-4"
        >
          <Logo logoUrl={draft.logoUrl ?? null} lang={lang} />
          <span className="rounded-full bg-clay-tint px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-clay-dark">
            {t("brandingPrimary", lang)}
          </span>
          <span className="inline-flex min-h-11 items-center rounded-full bg-sage-dark px-5 text-sm font-semibold text-cream">
            {t("brandingSecondary", lang)}
          </span>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-rose-dark">{error}</p>}
      {saved && !error && <p className="mt-3 text-sm text-sage-dark">{t("brandingSaved", lang)}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="text-sm text-slate hover:underline"
        >
          {t("brandingReset", lang)}
        </button>
        <div className="flex-1" />
        <Button variant="secondary" onClick={save} disabled={busy}>
          {busy ? t("saving", lang) : t("save", lang)}
        </Button>
      </div>
    </div>
  );
}
