import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Flame, MessageCircle, Music, VolumeX } from "lucide-react";
import { useGuest, useActiveGuest } from "../../context/GuestContext";
import { useDevice } from "../../context/DeviceContext";
import { Button } from "../Button";
import { SegmentedControl } from "../SegmentedControl";
import { PreferenceCard } from "../PreferenceCard";
import { Toggle } from "../Toggle";
import { oils } from "../../data/oils";
import {
  communicationTranslations,
  musicTranslations,
  oilNameTranslations,
  oilSubtitleTranslations,
  pillowTranslations,
  pressureTranslations,
  t,
} from "../../i18n/translations";
import type { CommunicationStyle, MusicPreference, PressureLevel } from "../../types";

const pressureOrder: PressureLevel[] = ["Lekki", "Średni", "Mocny", "Głęboki"];

const pressureDescKey: Record<PressureLevel, string> = {
  Lekki: "pressureDescLight",
  Średni: "pressureDescMedium",
  Mocny: "pressureDescFirm",
  Głęboki: "pressureDescDeep",
};

const musicOptions: { value: MusicPreference; icon: ReactNode }[] = [
  { value: "nature", icon: <Music size={16} /> },
  { value: "ambient", icon: <Music size={16} /> },
  { value: "silence", icon: <VolumeX size={16} /> },
];

const communicationOptions: { value: CommunicationStyle; subtitleKey: string; icon: ReactNode }[] = [
  { value: "silent", subtitleKey: "commSilentSubtitle", icon: <VolumeX size={18} /> },
  { value: "guided", subtitleKey: "commGuidedSubtitle", icon: <MessageCircle size={18} /> },
];

export function PreferencesStep() {
  const { state, dispatch } = useGuest();
  // Only a paired kiosk can store preferences, so the consent card is hidden in
  // the bundled demo rather than offering an opt-in that would 401 on save.
  const { token } = useDevice();
  const lang = state.language;
  const activeGuest = useActiveGuest();
  const { preferences } = activeGuest;
  const isCouple = state.partySize === 2;
  const activeIndex = state.activeGuestIndex;
  const crm = state.guestCrm[activeIndex] ?? { phone: "", consent: false, prefilled: false };

  const setPref = <K extends keyof typeof preferences>(
    key: K,
    value: (typeof preferences)[K],
  ) => dispatch({ type: "SET_PREFERENCE", key, value });

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
            options={pressureOrder.map((v) => ({ value: v, label: pressureTranslations[v][lang] }))}
            value={preferences.pressure}
            onChange={(v) => setPref("pressure", v)}
          />
          <p className="mt-3 text-xs font-medium text-slate-light">
            {t(pressureDescKey[preferences.pressure], lang)}
          </p>
        </PreferenceCard>

        <PreferenceCard
          title={t("massageOil", lang)}
          description={t("oilCardDesc", lang)}
        >
          <div className="grid grid-cols-2 gap-2.5">
            {oils.map((oil) => {
              const isSelected = preferences.oilId === oil.id;
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
                    {oilNameTranslations[oil.id]?.[lang] ?? oil.name}
                  </div>
                  <div className="text-xs text-slate-light">
                    {oilSubtitleTranslations[oil.id]?.[lang] ?? oil.subtitle}
                  </div>
                </button>
              );
            })}
          </div>
        </PreferenceCard>

        <PreferenceCard
          title={t("tableWarming", lang)}
          description={t("tableWarmingCardDesc", lang)}
        >
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

          <div className="my-4 h-px bg-sand" />

          <div className="mb-2 text-sm font-semibold text-charcoal">
            {t("headrestPillow", lang)}
          </div>
          <SegmentedControl
            options={[
              { value: "Standardowa", label: pillowTranslations["Standardowa"][lang] },
              { value: "Ultra-miękka", label: pillowTranslations["Ultra-miękka"][lang] },
            ]}
            value={preferences.headrestPillow}
            onChange={(v) => setPref("headrestPillow", v)}
          />

          <div className="my-4 h-px bg-sand" />

          <div className="mb-2 text-sm font-semibold text-charcoal">
            {t("backgroundMusic", lang)}
          </div>
          <div className="flex flex-wrap gap-2">
            {musicOptions.map((opt) => {
              const isSelected = preferences.music === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPref("music", opt.value)}
                  className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-all duration-300 active:scale-[0.98] ${
                    isSelected
                      ? "border-clay bg-clay-tint text-clay-dark"
                      : "border-sand bg-white text-slate hover:border-clay/40"
                  }`}
                >
                  {opt.icon}
                  {musicTranslations[opt.value][lang]}
                </button>
              );
            })}
          </div>
        </PreferenceCard>

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
              onChange={(v) =>
                dispatch({ type: "SET_GUEST_CONSENT", index: activeIndex, consent: v })
              }
              label={t("consentSaveTitle", lang)}
            />
          </div>
          {crm.consent && !crm.phone.trim() && (
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
        <Button onClick={() => dispatch({ type: "COMPLETE_GUEST_PREFERENCES" })}>
          {t("confirmLock", lang)}
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}
