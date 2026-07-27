import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { languages, t, type LangCode } from "../../i18n/translations";
import {
  COMFORT_LIST_SECTIONS,
  defaultComfortConfig,
  fetchComfort,
  saveComfort,
  type ComfortConfig,
  type ComfortListKey,
  type ComfortOption,
} from "../../lib/comfort";
import { Button } from "../Button";
import { Toggle } from "../Toggle";

// Per-location comfort options editor (location_settings.comfort, migration
// 0027), mounted in /manage under the rooms section. Decides which comfort
// features the kiosk asks about at all, and — for oil / music / pillow — what
// the choices are, each with the same "Polish name + optional per-language
// translations" model as a service name in the offer CMS.
//
// The first open shows the built-in menu: fetchComfort() normalizes an unset
// `{}` into it, so the manager edits concrete rows rather than an empty list,
// and a location that never touches this screen keeps behaving exactly as it
// did before 0027.

const otherLangs = languages.map((l) => l.code).filter((c): c is LangCode => c !== "pl");

// Section title keys — reusing the kiosk's own labels so the manager sees the
// same words the guest does.
const SECTION_TITLE: Record<ComfortListKey | "tableWarming" | "communication", string> = {
  oil: "massageOil",
  music: "backgroundMusic",
  pillow: "headrestPillow",
  tableWarming: "tableWarming",
  communication: "communication",
};

// Ids are permanent: a guest's remembered preference points at one, so they are
// generated once here and never derived from the (editable) name.
const newOptionId = () =>
  `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function ComfortEditor({ locationId }: { locationId: string }) {
  const { lang } = useLanguage();
  const [draft, setDraft] = useState<ComfortConfig>(() => defaultComfortConfig());
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    setSaved(false);
    fetchComfort(locationId)
      .then((c) => {
        if (!cancelled) setDraft(c);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const update = (patch: Partial<ComfortConfig>) => {
    setSaved(false);
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const setOptions = (key: ComfortListKey, options: ComfortOption[]) =>
    update({ [key]: { ...draft[key], options } } as Partial<ComfortConfig>);

  const patchOption = (key: ComfortListKey, index: number, patch: Partial<ComfortOption>) =>
    setOptions(
      key,
      draft[key].options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    );

  const moveOption = (key: ComfortListKey, from: number, to: number) => {
    const options = [...draft[key].options];
    if (to < 0 || to >= options.length) return;
    const [moved] = options.splice(from, 1);
    options.splice(to, 0, moved);
    setOptions(key, options);
  };

  const addOption = (key: ComfortListKey) =>
    setOptions(key, [
      ...draft[key].options,
      { id: newOptionId(), name_i18n: { pl: t("cmsComfortNewOption", lang) } },
    ]);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      // Blank Polish names would render as unlabelled buttons on the kiosk and
      // are dropped by normalizeComfort on the way back in anyway.
      const clean: ComfortConfig = { ...draft };
      for (const key of COMFORT_LIST_SECTIONS) {
        clean[key] = {
          ...draft[key],
          options: draft[key].options.filter((o) => (o.name_i18n.pl ?? "").trim().length > 0),
        };
      }
      await saveComfort(locationId, clean);
      setDraft(clean);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="rounded-3xl bg-white p-6 shadow-soft sm:p-8">
      <p className="mb-5 text-sm text-slate">{t("cmsComfortHint", lang)}</p>

      <div className="flex flex-col gap-5">
        {COMFORT_LIST_SECTIONS.map((key) => (
          <SectionShell
            key={key}
            title={t(SECTION_TITLE[key], lang)}
            enabled={draft[key].enabled}
            onEnabledChange={(v) =>
              update({ [key]: { ...draft[key], enabled: v } } as Partial<ComfortConfig>)
            }
          >
            <p className="mb-3 text-xs text-slate-light">{t("cmsComfortRemoveHint", lang)}</p>
            <div className="flex flex-col gap-2">
              {draft[key].options.map((option, i) => (
                <OptionRow
                  key={option.id}
                  option={option}
                  lang={lang}
                  withSubtitle={key === "oil"}
                  canRemove={draft[key].options.length > 1}
                  onChange={(patch) => patchOption(key, i, patch)}
                  onRemove={() =>
                    setOptions(
                      key,
                      draft[key].options.filter((_, j) => j !== i),
                    )
                  }
                  onMoveUp={i > 0 ? () => moveOption(key, i, i - 1) : undefined}
                  onMoveDown={
                    i < draft[key].options.length - 1 ? () => moveOption(key, i, i + 1) : undefined
                  }
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => addOption(key)}
              className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-sand px-3.5 text-sm font-medium text-sage-dark transition-colors hover:bg-sage-tint"
            >
              <Plus size={14} />
              {t("cmsComfortAddOption", lang)}
            </button>
          </SectionShell>
        ))}

        {/* Single controls, not menus — nothing to configure beyond on/off. */}
        <SectionShell
          title={t(SECTION_TITLE.tableWarming, lang)}
          enabled={draft.tableWarming.enabled}
          onEnabledChange={(v) => update({ tableWarming: { enabled: v } })}
        />
        <SectionShell
          title={t(SECTION_TITLE.communication, lang)}
          enabled={draft.communication.enabled}
          onEnabledChange={(v) => update({ communication: { enabled: v } })}
        />
      </div>

      {error && <p className="mt-4 text-sm text-rose-dark">{error}</p>}
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={handleSave} disabled={busy}>
          {t("save", lang)}
        </Button>
        {saved && <span className="text-sm text-sage-dark">{t("cmsComfortSaved", lang)}</span>}
      </div>
    </div>
  );
}

// One comfort feature: a title with its on/off switch, and (for the list
// sections) its options underneath — hidden while the feature is off, since
// there is nothing to configure for something the kiosk won't ask about.
function SectionShell({
  title,
  enabled,
  onEnabledChange,
  children,
}: {
  title: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  const { lang } = useLanguage();
  return (
    <div className="rounded-2xl border border-sand p-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-charcoal">{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-light">{t("cmsComfortOffered", lang)}</span>
          <Toggle checked={enabled} onChange={onEnabledChange} label={title} />
        </div>
      </div>
      {enabled && children && <div className="mt-4">{children}</div>}
    </div>
  );
}

function OptionRow({
  option,
  lang,
  withSubtitle,
  canRemove,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  option: ComfortOption;
  lang: LangCode;
  withSubtitle: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<ComfortOption>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [showTranslations, setShowTranslations] = useState(false);
  const setName = (code: LangCode, value: string) =>
    onChange({ name_i18n: { ...option.name_i18n, [code]: value } });
  const setSubtitle = (code: LangCode, value: string) =>
    onChange({ subtitle_i18n: { ...(option.subtitle_i18n ?? {}), [code]: value } });

  return (
    <div className="rounded-xl bg-cream p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <input
            value={option.name_i18n.pl ?? ""}
            onChange={(e) => setName("pl", e.target.value)}
            placeholder={`${t("cmsName", lang)} (PL)`}
            className={inputClass}
          />
          {withSubtitle && (
            <input
              value={option.subtitle_i18n?.pl ?? ""}
              onChange={(e) => setSubtitle("pl", e.target.value)}
              placeholder={`${t("cmsComfortSubtitle", lang)} (PL)`}
              className={inputClass}
            />
          )}
        </div>
        <div className="flex shrink-0 items-center">
          {/* Arrows, not drag: this list is short and lives inside a card, and
              arrows are the keyboard-accessible path the CMS already uses. */}
          <IconButton onClick={onMoveUp} label="↑">
            <ChevronUp size={16} />
          </IconButton>
          <IconButton onClick={onMoveDown} label="↓">
            <ChevronDown size={16} />
          </IconButton>
          <IconButton
            onClick={canRemove ? onRemove : undefined}
            label={canRemove ? t("cmsRemove", lang) : t("cmsComfortLastOption", lang)}
            danger
          >
            <X size={16} />
          </IconButton>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowTranslations((v) => !v)}
        className="mt-2 text-xs font-medium text-sage-dark hover:underline"
      >
        {showTranslations ? t("cmsHideTranslations", lang) : t("cmsAddTranslations", lang)}
      </button>
      {showTranslations && (
        <div className="mt-2 rounded-xl bg-oatmeal p-3">
          <p className="mb-2 text-xs text-slate-light">{t("cmsFallbackNote", lang)}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {otherLangs.map((code) => (
              <label key={code} className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-light">
                  {languages.find((l) => l.code === code)!.label}
                </span>
                <input
                  value={option.name_i18n[code] ?? ""}
                  onChange={(e) => setName(code, e.target.value)}
                  className={inputClass}
                />
                {withSubtitle && (
                  <input
                    value={option.subtitle_i18n?.[code] ?? ""}
                    onChange={(e) => setSubtitle(code, e.target.value)}
                    placeholder={t("cmsComfortSubtitle", lang)}
                    className={inputClass}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({
  onClick,
  label,
  danger,
  children,
}: {
  onClick?: () => void;
  label: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-slate-light transition-colors disabled:opacity-30 ${
        danger ? "hover:bg-rose-tint hover:text-rose-dark" : "hover:bg-oatmeal"
      }`}
    >
      {children}
    </button>
  );
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-sand bg-white px-3 text-charcoal outline-none focus:border-sage";
