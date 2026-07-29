import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Search, Sparkles } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { checkinLookup, checkinSave } from "../../lib/checkin";
import type { StoredPreferences } from "../../lib/guestProfile";
import {
  clampComfortId,
  defaultComfortConfig,
  COMFORT_LIST_SECTIONS,
  type ComfortConfig,
} from "../../lib/comfort";
import { ALL_PRESSURE_LEVELS, nearestPressure } from "../../lib/catalog";
import { t } from "../../i18n/translations";
import { Button } from "../Button";
import { LanguageSelector } from "../LanguageSelector";
import { Toggle } from "../Toggle";
import { CheckinPrefsEditor } from "./CheckinPrefsEditor";
import type { LangCode, PressureLevel } from "../../types";

type Stage = "phone" | "looking" | "notFound" | "editing" | "saving" | "saved" | "linkInvalid" | "error";

// Snap the stored preferences onto what this location offers now — the
// phone-side counterpart of the kiosk's clamps in PreferencesStep. Comfort
// fields for disabled sections are left as-is; the server drops them on save.
function clampStoredToOffer(
  prefs: StoredPreferences,
  comfort: ComfortConfig,
  pressureLevels: PressureLevel[],
): StoredPreferences {
  const field = { oil: "oilId", music: "music", pillow: "headrestPillow" } as const;
  const next = { ...prefs };
  for (const key of COMFORT_LIST_SECTIONS) {
    const current = next[field[key]];
    const fix = clampComfortId(comfort[key], current ?? "");
    if (fix) next[field[key]] = fix;
  }
  const pressureFix = nearestPressure(next.pressure ?? "Średni", pressureLevels);
  if (pressureFix) next.pressure = pressureFix;
  return next;
}

// The two-consent card, identical in wording and nesting to the kiosk's
// PreferencesStep — this page now captures consent itself (see
// api/_checkinCore.ts's header comment for the trust-model change) rather
// than only editing an already-consented profile. Unlike the kiosk there's no
// phone field here (already entered on the previous screen) and no `prefilled`
// concept (a profile existing at all is what got us to this screen, so the
// withdraw hints show off the toggles' own state).
function ConsentSection({
  consent,
  healthConsent,
  marketingConsent,
  name,
  email,
  onConsentChange,
  onHealthConsentChange,
  onMarketingConsentChange,
  onNameChange,
  onEmailChange,
  lang,
}: {
  consent: boolean;
  healthConsent: boolean;
  marketingConsent: boolean;
  name: string;
  email: string;
  onConsentChange: (v: boolean) => void;
  onHealthConsentChange: (v: boolean) => void;
  onMarketingConsentChange: (v: boolean) => void;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  lang: LangCode;
}) {
  return (
    <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-charcoal">{t("consentSaveTitle", lang)}</div>
          <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-slate-light">
            {t("consentSaveBody", lang)}
          </p>
        </div>
        <Toggle checked={consent} onChange={onConsentChange} label={t("consentSaveTitle", lang)} />
      </div>
      {!consent && (
        <p className="mt-3 text-xs font-medium leading-relaxed text-rose-dark">
          {t("consentWithdrawHint", lang)}
        </p>
      )}
      {consent && (
        <div className="mt-4">
          <label htmlFor="checkinCrmName" className="mb-2 block text-sm font-semibold text-charcoal">
            {t("consentNameLabel", lang)}
          </label>
          <input
            id="checkinCrmName"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-sand bg-white px-3 text-base text-charcoal outline-none transition-all duration-300 focus:border-clay focus:ring-4 focus:ring-clay/15"
          />
        </div>
      )}
      {consent && (
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
              checked={healthConsent}
              onChange={onHealthConsentChange}
              label={t("consentHealthTitle", lang)}
            />
          </div>
          {!healthConsent && (
            <p className="mt-3 text-xs font-medium leading-relaxed text-rose-dark">
              {t("consentHealthWithdrawHint", lang)}
            </p>
          )}
        </div>
      )}
      {consent && (
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
              checked={marketingConsent}
              onChange={onMarketingConsentChange}
              label={t("consentMarketingTitle", lang)}
            />
          </div>
          {!marketingConsent && (
            <p className="mt-3 text-xs font-medium leading-relaxed text-rose-dark">
              {t("consentMarketingWithdrawHint", lang)}
            </p>
          )}
          {marketingConsent && (
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label htmlFor="checkinCrmEmail" className="mb-2 block text-sm font-semibold text-charcoal">
                  {t("consentMarketingEmailLabel", lang)}
                </label>
                <input
                  id="checkinCrmEmail"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-sand bg-white px-3 text-base text-charcoal outline-none transition-all duration-300 focus:border-clay focus:ring-4 focus:ring-clay/15"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A code error surfaces as a fixed set of server strings (see
// api/_checkinCore.ts's resolveCode) — never localized copy of its own, since
// they only ever reach an anonymous guest via this one screen. Map them to a
// single "the link no longer works" state rather than showing raw English.
function isCodeError(message: string): boolean {
  return /code/i.test(message) || /attempts/i.test(message);
}

// Anonymous, self-contained page reached by scanning the QR the kiosk shows
// (welcome step → "Pokaż kod QR"). No AuthProvider/DeviceProvider — the only
// credential this page has is the short-lived `c` code in the URL, which
// authorizes exactly one lookup+edit+save cycle for one location (see
// api/_checkinCore.ts). Reuses the global LanguageProvider (already mounted
// for every route) purely as a per-guest language switcher on their own phone.
export function CheckinPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("c");
  const { lang } = useLanguage();

  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>(code ? "phone" : "linkInvalid");
  const [prefs, setPrefs] = useState<StoredPreferences | null>(null);
  // Comfort options of the code's location, resolved by the lookup. The
  // built-in menu until then — nothing renders it before `editing` anyway.
  const [comfort, setComfort] = useState<ComfortConfig>(() => defaultComfortConfig());
  // Pressure is per-service, and this page has no treatment picked — the lookup
  // returns the union across the location's active services.
  const [pressureLevels, setPressureLevels] = useState<PressureLevel[]>(ALL_PRESSURE_LEVELS);
  // A profile existing at all IS standing base consent, so a successful
  // lookup starts both toggles from what the row already carries — consent
  // true, healthConsent from the lookup response. Switching base off forces
  // health off too (mirrors GuestContext's SET_GUEST_CONSENT nesting).
  const [consent, setConsent] = useState(true);
  const [healthConsent, setHealthConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [crmName, setCrmName] = useState("");
  const [crmEmail, setCrmEmail] = useState("");

  const phoneValid = phone.replace(/\D/g, "").length >= 6;

  const handleLookup = async () => {
    if (!code || !phoneValid) return;
    setStage("looking");
    try {
      const found = await checkinLookup(code, phone);
      if (!found) {
        setStage("notFound");
        return;
      }
      // Clamp once, here: a stored pressure/oil/music/pillow the location no
      // longer offers would otherwise stay selected-but-invisible and be saved
      // straight back.
      setPrefs(clampStoredToOffer(found.preferences, found.comfort, found.pressureLevels));
      setComfort(found.comfort);
      setPressureLevels(found.pressureLevels);
      setConsent(true);
      setHealthConsent(found.healthConsent);
      setMarketingConsent(found.marketingConsent);
      setCrmName(found.name ?? "");
      setStage("editing");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setStage(isCodeError(msg) ? "linkInvalid" : "error");
    }
  };

  const handleConsentChange = (v: boolean) => {
    setConsent(v);
    if (!v) {
      setHealthConsent(false);
      setMarketingConsent(false);
    }
  };

  const handleSave = async () => {
    if (!code || !prefs) return;
    setStage("saving");
    try {
      // The name goes with base consent; only the e-mail waits on marketing.
      const contact =
        consent && marketingConsent ? { email: crmEmail.trim() || undefined } : undefined;
      const ok = await checkinSave(
        code,
        phone,
        prefs,
        consent,
        healthConsent,
        consent ? crmName.trim() : "",
        contact,
      );
      if (!ok) {
        setStage("notFound");
        return;
      }
      setStage("saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setStage(isCodeError(msg) ? "linkInvalid" : "error");
    }
  };

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-6 sm:px-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-tint px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sage-dark">
          <Sparkles size={12} />
          {t("checkinPhoneTitle", lang)}
        </span>
        <LanguageSelector />
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {stage === "linkInvalid" && (
          <StatusCard title={t("checkinLinkInvalid", lang)} body={t("checkinLinkExpired", lang)} />
        )}

        {stage === "error" && <StatusCard title={t("checkinError", lang)} tone="error" />}

        {(stage === "phone" || stage === "looking") && (
          <div className="rounded-2xl border border-sand bg-white p-6 shadow-soft">
            <h1 className="mb-2 font-serif text-2xl text-charcoal">{t("checkinPhoneTitle", lang)}</h1>
            <p className="mb-5 text-sm leading-relaxed text-slate-light">{t("checkinPhonePrompt", lang)}</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="tel"
                inputMode="tel"
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("guestPhonePlaceholder", lang)}
                className="min-h-12 flex-1 rounded-xl border border-sand bg-white px-4 text-base text-charcoal placeholder:text-sm placeholder:text-slate-light/70 outline-none transition-all duration-300 focus:border-clay focus:ring-4 focus:ring-clay/15"
              />
              <Button
                onClick={handleLookup}
                disabled={!phoneValid || stage === "looking"}
                className="w-full sm:w-auto"
              >
                <Search size={16} />
                {t("checkinPhoneSubmit", lang)}
              </Button>
            </div>
          </div>
        )}

        {stage === "notFound" && <StatusCard title={t("checkinNoProfile", lang)} />}

        {(stage === "editing" || stage === "saving") && prefs && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="mb-1 font-serif text-2xl text-charcoal">{t("checkinPrefsTitle", lang)}</h1>
              <p className="text-sm leading-relaxed text-slate-light">{t("checkinPrefsIntro", lang)}</p>
            </div>
            <ConsentSection
              consent={consent}
              healthConsent={healthConsent}
              marketingConsent={marketingConsent}
              name={crmName}
              email={crmEmail}
              onConsentChange={handleConsentChange}
              onHealthConsentChange={setHealthConsent}
              onMarketingConsentChange={setMarketingConsent}
              onNameChange={setCrmName}
              onEmailChange={setCrmEmail}
              lang={lang}
            />
            <CheckinPrefsEditor
              value={prefs}
              onChange={setPrefs}
              lang={lang}
              healthConsent={healthConsent}
              comfort={comfort}
              pressureLevels={pressureLevels}
            />
            <Button onClick={handleSave} disabled={stage === "saving"} className="w-full sm:w-auto sm:self-end">
              {t("checkinSave", lang)}
              <ArrowRight size={18} />
            </Button>
          </div>
        )}

        {stage === "saved" && !consent && (
          <StatusCard
            title={t("checkinForgotten", lang)}
            body={t("checkinForgottenInfo", lang)}
            tone="success"
          />
        )}

        {stage === "saved" && consent && (
          <StatusCard
            title={t("checkinSaved", lang)}
            body={t("checkinSavedInfo", lang)}
            tone="success"
          />
        )}
      </div>
    </div>
  );
}

function StatusCard({
  title,
  body,
  tone = "neutral",
}: {
  title: string;
  body?: string;
  tone?: "neutral" | "success" | "error";
}) {
  return (
    <div className="rounded-2xl border border-sand bg-white p-6 text-center shadow-soft">
      {tone === "success" && (
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sage-tint text-sage-dark">
          <Check size={22} strokeWidth={3} />
        </span>
      )}
      <h1 className={`${body ? "mb-2" : ""} font-serif text-2xl ${tone === "error" ? "text-rose-dark" : "text-charcoal"}`}>
        {title}
      </h1>
      {body && <p className="text-sm leading-relaxed text-slate-light">{body}</p>}
    </div>
  );
}
