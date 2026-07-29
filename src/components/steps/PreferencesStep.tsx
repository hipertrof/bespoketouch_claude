import { useEffect, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Flame, MessageCircle, Music, VolumeX } from "lucide-react";
import { useGuest, useActiveGuest } from "../../context/GuestContext";
import { useDevice } from "../../context/DeviceContext";
import { useCatalog } from "../../context/CatalogContext";
import { Button } from "../Button";
import { SegmentedControl } from "../SegmentedControl";
import { PreferenceCard } from "../PreferenceCard";
import { Toggle } from "../Toggle";
import { clampComfortId, comfortLabel, comfortSubtitle } from "../../lib/comfort";
import { nearestPressure } from "../../lib/catalog";
import {
  communicationTranslations,
  pressureTranslations,
  t,
} from "../../i18n/translations";
import type { CommunicationStyle, PressureLevel } from "../../types";

const pressureOrder: PressureLevel[] = ["Lekki", "Średni", "Mocny", "Głęboki"];

const pressureDescKey: Record<PressureLevel, string> = {
  Lekki: "pressureDescLight",
  Średni: "pressureDescMedium",
  Mocny: "pressureDescFirm",
  Głęboki: "pressureDescDeep",
};

// Music options are per-location now, so the icon is chosen by id where we know
// it and falls back to the generic note for anything a manager added.
const musicIcon = (id: string): ReactNode =>
  id === "silence" ? <VolumeX size={16} /> : <Music size={16} />;

const communicationOptions: { value: CommunicationStyle; subtitleKey: string; icon: ReactNode }[] = [
  { value: "silent", subtitleKey: "commSilentSubtitle", icon: <VolumeX size={18} /> },
  { value: "guided", subtitleKey: "commGuidedSubtitle", icon: <MessageCircle size={18} /> },
];

export function PreferencesStep() {
  const { state, dispatch } = useGuest();
  // Only a paired kiosk can store preferences, so the consent card is hidden in
  // the bundled demo rather than offering an opt-in that would 401 on save.
  const { token } = useDevice();
  // Which comfort options this location offers (built-in menu when unpaired).
  const { comfort } = useCatalog();
  const lang = state.language;
  const activeGuest = useActiveGuest();
  const { preferences } = activeGuest;
  const isCouple = state.partySize === 2;
  const activeIndex = state.activeGuestIndex;
  const crm =
    state.guestCrm[activeIndex] ??
    {
      phone: "",
      consent: false,
      healthConsent: false,
      marketingConsent: false,
      name: "",
      email: "",
      prefilled: false,
    };
  // Any consent tier requires a phone to key the save to — without one there's
  // nothing to save under. A prefilled guest already has a valid phone from
  // the lookup, so this only blocks a fresh guest who toggled consent on
  // without entering a number.
  const phoneValid = crm.phone.replace(/\D/g, "").length >= 6;

  const setPref = <K extends keyof typeof preferences>(
    key: K,
    value: (typeof preferences)[K],
  ) => dispatch({ type: "SET_PREFERENCE", key, value });

  // Only the levels the selected massage offers; no treatment picked (or the
  // demo/no-restriction case) shows all four.
  const treatmentId = state.treatmentSelections[activeIndex]?.treatmentId;
  const treatment = state.catalog.find((m) => m.id === treatmentId);
  const allowedPressures = pressureOrder.filter(
    (p) => !treatment?.pressureLevels || treatment.pressureLevels.includes(p),
  );

  // Snap an out-of-range pressure (stale default, CRM prefill, or a massage
  // switch after the fact) to the closest still-offered level.
  useEffect(() => {
    const nearest = nearestPressure(preferences.pressure, allowedPressures);
    if (nearest) setPref("pressure", nearest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedPressures.join(","), preferences.pressure]);

  // Same idea for the three id-valued fields: a default, a CRM prefill, or a
  // config edited mid-session can leave a value this location doesn't offer, so
  // snap it to the first option. Disabled sections are left alone — the field is
  // dropped at submit (stripDisabled) rather than shown.
  const oilFix = clampComfortId(comfort.oil, preferences.oilId);
  const musicFix = clampComfortId(comfort.music, preferences.music);
  const pillowFix = clampComfortId(comfort.pillow, preferences.headrestPillow);
  useEffect(() => {
    if (oilFix) setPref("oilId", oilFix);
    if (musicFix) setPref("music", musicFix);
    if (pillowFix) setPref("headrestPillow", pillowFix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oilFix, musicFix, pillowFix]);

  // The middle card holds three independent sub-features; with all three off it
  // has no content left, so it doesn't render at all.
  const showComfortCard =
    comfort.tableWarming.enabled || comfort.pillow.enabled || comfort.music.enabled;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      {isCouple && (
        <span className="mb-3 inline-flex items-center rounded-full bg-sage-tint px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sage-dark">
          {state.guestNames[state.activeGuestIndex]?.trim() ||
            `${t("person", lang)} ${state.activeGuestIndex + 1}`}
        </span>
      )}
      <h1 className="mb-2 font-serif text-3xl text-charcoal sm:text-4xl">
        {t("prefsTitle", lang)}
      </h1>
      <p className="mb-8 max-w-xl text-base leading-relaxed text-slate">
        {t("prefsIntro", lang)}
      </p>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <PreferenceCard
          title={t("pressureCardTitle", lang)}
          description={t("pressureCardDesc", lang)}
        >
          <SegmentedControl
            options={allowedPressures.map((v) => ({ value: v, label: pressureTranslations[v][lang] }))}
            value={preferences.pressure}
            onChange={(v) => setPref("pressure", v)}
          />
          <p className="mt-3 text-xs font-medium text-slate-light">
            {t(pressureDescKey[preferences.pressure], lang)}
          </p>
        </PreferenceCard>

        {comfort.oil.enabled && (
        <PreferenceCard
          title={t("massageOil", lang)}
          description={t("oilCardDesc", lang)}
        >
          <div className="grid grid-cols-2 gap-2.5">
            {comfort.oil.options.map((oil) => {
              const isSelected = preferences.oilId === oil.id;
              const subtitle = comfortSubtitle(oil, lang);
              return (
                <button
                  key={oil.id}
                  type="button"
                  onClick={() => setPref("oilId", oil.id)}
                  className={`relative min-h-16 rounded-xl border p-3 text-left transition-all duration-300 active:scale-[0.98] ${
                    isSelected
                      ? "border-clay bg-clay-tint shadow-soft"
                      : "border-sand bg-white hover:border-clay/40 hover:bg-oatmeal/60"
                  }`}
                >
                  {isSelected && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-sage-dark text-cream">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                  <div className="pr-5 text-sm font-semibold text-charcoal">
                    {comfortLabel(oil, lang)}
                  </div>
                  {subtitle && <div className="text-xs text-slate-light">{subtitle}</div>}
                </button>
              );
            })}
          </div>
        </PreferenceCard>
        )}

        {showComfortCard && (
        <PreferenceCard
          // The card groups three independent sub-features; whichever of them is
          // switched on first names it, so a location without a heated table
          // doesn't get a card headed "Podgrzewanie stołu".
          title={t(
            comfort.tableWarming.enabled
              ? "tableWarming"
              : comfort.pillow.enabled
                ? "headrestPillow"
                : "backgroundMusic",
            lang,
          )}
          description={comfort.tableWarming.enabled ? t("tableWarmingCardDesc", lang) : ""}
        >
          {comfort.tableWarming.enabled && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                <Flame size={18} className="text-clay-dark" />
                {preferences.tableWarming ? t("on", lang) : t("off", lang)}
              </div>
              <Toggle
                checked={preferences.tableWarming}
                onChange={(v) => setPref("tableWarming", v)}
                label={t("tableWarming", lang)}
              />
            </div>
          )}

          {comfort.pillow.enabled && (
            <>
              {comfort.tableWarming.enabled && <div className="my-4 h-px bg-sand" />}
              <div className="mb-2 text-sm font-semibold text-charcoal">
                {t("headrestPillow", lang)}
              </div>
              <SegmentedControl
                options={comfort.pillow.options.map((o) => ({
                  value: o.id,
                  label: comfortLabel(o, lang),
                }))}
                value={preferences.headrestPillow}
                onChange={(v) => setPref("headrestPillow", v)}
              />
            </>
          )}

          {comfort.music.enabled && (
            <>
              {(comfort.tableWarming.enabled || comfort.pillow.enabled) && (
                <div className="my-4 h-px bg-sand" />
              )}
              <div className="mb-2 text-sm font-semibold text-charcoal">
                {t("backgroundMusic", lang)}
              </div>
              <div className="flex flex-wrap gap-2">
                {comfort.music.options.map((opt) => {
                  const isSelected = preferences.music === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPref("music", opt.id)}
                      className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-all duration-300 active:scale-[0.98] ${
                        isSelected
                          ? "border-clay bg-clay-tint text-clay-dark"
                          : "border-sand bg-white text-slate hover:border-clay/40"
                      }`}
                    >
                      {musicIcon(opt.id)}
                      {comfortLabel(opt, lang)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </PreferenceCard>
        )}

        {comfort.communication.enabled && (
        <PreferenceCard
          title={t("communication", lang)}
          description={t("communicationCardDesc", lang)}
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {communicationOptions.map((opt) => {
              const isSelected = preferences.communication === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPref("communication", opt.value)}
                  className={`flex min-h-24 flex-col gap-1.5 rounded-xl border p-4 text-left transition-all duration-300 active:scale-[0.98] ${
                    isSelected
                      ? "border-clay bg-clay-tint shadow-soft"
                      : "border-sand bg-white hover:border-clay/40 hover:bg-oatmeal/60"
                  }`}
                >
                  <span className={isSelected ? "text-clay-dark" : "text-slate-light"}>
                    {opt.icon}
                  </span>
                  <span className="text-sm font-semibold text-charcoal">
                    {communicationTranslations[opt.value][lang]}
                  </span>
                  <span className="text-xs leading-snug text-slate-light">
                    {t(opt.subtitleKey, lang)}
                  </span>
                </button>
              );
            })}
          </div>
        </PreferenceCard>
        )}
      </div>

      {token && (
        <div className="mt-8 rounded-2xl border border-sand bg-white p-5 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-charcoal">
                {t("consentSaveTitle", lang)}
              </div>
              <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-slate-light">
                {t("consentSaveBody", lang)}
              </p>
            </div>
            <Toggle
              checked={crm.consent}
              onChange={(v) => {
                dispatch({ type: "SET_GUEST_CONSENT", index: activeIndex, consent: v });
                // The name rides on BASE consent since v4, so prefill it from
                // the intake name here rather than on the marketing toggle —
                // reception already typed it on the welcome step.
                if (v && !crm.name.trim()) {
                  const intakeName = (state.guestNames[activeIndex] ?? "").trim();
                  if (intakeName) {
                    dispatch({ type: "SET_GUEST_CRM_NAME", index: activeIndex, name: intakeName });
                  }
                }
              }}
              label={t("consentSaveTitle", lang)}
            />
          </div>
          {crm.prefilled && !crm.consent && (
            <p className="mt-3 text-xs font-medium leading-relaxed text-rose-dark">
              {t("consentWithdrawHint", lang)}
            </p>
          )}
          {crm.consent && (
            <div className="mt-4">
              <label
                htmlFor={`crmName-${activeIndex}`}
                className="mb-2 block text-sm font-semibold text-charcoal"
              >
                {t("consentNameLabel", lang)}
              </label>
              <input
                id={`crmName-${activeIndex}`}
                type="text"
                value={crm.name}
                onChange={(e) =>
                  dispatch({ type: "SET_GUEST_CRM_NAME", index: activeIndex, name: e.target.value })
                }
                className="min-h-11 w-full max-w-sm rounded-xl border border-sand bg-white px-3 text-base text-charcoal placeholder:text-sm placeholder:text-slate-light/70 outline-none transition-all duration-300 focus:border-clay focus:ring-4 focus:ring-clay/15"
              />
            </div>
          )}
          {crm.consent && (
            <div className="mt-4 rounded-xl border border-sand bg-oatmeal/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-charcoal">
                    {t("consentHealthTitle", lang)}
                  </div>
                  <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-slate-light">
                    {t("consentHealthBody", lang)}
                  </p>
                </div>
                <Toggle
                  checked={crm.healthConsent}
                  onChange={(v) =>
                    dispatch({
                      type: "SET_GUEST_HEALTH_CONSENT",
                      index: activeIndex,
                      healthConsent: v,
                    })
                  }
                  label={t("consentHealthTitle", lang)}
                />
              </div>
              {crm.prefilled && !crm.healthConsent && (
                <p className="mt-3 text-xs font-medium leading-relaxed text-rose-dark">
                  {t("consentHealthWithdrawHint", lang)}
                </p>
              )}
            </div>
          )}
          {crm.consent && (
            <div className="mt-4 rounded-xl border border-sand bg-oatmeal/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-charcoal">
                    {t("consentMarketingTitle", lang)}
                  </div>
                  <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-slate-light">
                    {t("consentMarketingBody", lang)}
                  </p>
                </div>
                <Toggle
                  checked={crm.marketingConsent}
                  onChange={(v) =>
                    dispatch({
                      type: "SET_GUEST_MARKETING_CONSENT",
                      index: activeIndex,
                      marketingConsent: v,
                    })
                  }
                  label={t("consentMarketingTitle", lang)}
                />
              </div>
              {crm.prefilled && !crm.marketingConsent && (
                <p className="mt-3 text-xs font-medium leading-relaxed text-rose-dark">
                  {t("consentMarketingWithdrawHint", lang)}
                </p>
              )}
              {crm.marketingConsent && (
                <div className="mt-4 flex flex-col gap-3">
                  <div>
                    <label
                      htmlFor={`crmEmail-${activeIndex}`}
                      className="mb-2 block text-sm font-semibold text-charcoal"
                    >
                      {t("consentMarketingEmailLabel", lang)}
                    </label>
                    <input
                      id={`crmEmail-${activeIndex}`}
                      type="email"
                      inputMode="email"
                      value={crm.email}
                      onChange={(e) =>
                        dispatch({ type: "SET_GUEST_CRM_EMAIL", index: activeIndex, email: e.target.value })
                      }
                      className="min-h-11 w-full max-w-sm rounded-xl border border-sand bg-white px-3 text-base text-charcoal placeholder:text-sm placeholder:text-slate-light/70 outline-none transition-all duration-300 focus:border-clay focus:ring-4 focus:ring-clay/15"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          {crm.consent && !crm.prefilled && (
            <div className="mt-4">
              <label
                htmlFor="consentPhone"
                className="mb-2 block text-sm font-semibold text-charcoal"
              >
                {t("consentPhoneLabel", lang)}
              </label>
              <input
                id="consentPhone"
                type="tel"
                inputMode="tel"
                value={crm.phone}
                onChange={(e) =>
                  dispatch({ type: "SET_GUEST_PHONE", index: activeIndex, phone: e.target.value })
                }
                placeholder={t("guestPhonePlaceholder", lang)}
                className="min-h-11 w-full max-w-sm rounded-xl border border-sand bg-white px-3 text-base text-charcoal placeholder:text-sm placeholder:text-slate-light/70 outline-none transition-all duration-300 focus:border-clay focus:ring-4 focus:ring-clay/15"
              />
            </div>
          )}
          {crm.consent && !phoneValid && (
            <p className="mt-3 text-xs font-medium leading-relaxed text-rose-dark">
              {t("consentPhoneRequiredHint", lang)}
            </p>
          )}
        </div>
      )}

      <div className="mt-10 flex flex-col-reverse justify-between gap-3 sm:flex-row">
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: "SET_STEP", step: "bodyMap" })}
        >
          <ArrowLeft size={18} />
          {t("backButton", lang)}
        </Button>
        <Button
          onClick={() => dispatch({ type: "COMPLETE_GUEST_PREFERENCES" })}
          disabled={crm.consent && !phoneValid}
        >
          {t("confirmLock", lang)}
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}
