import { Check } from "lucide-react";
import { t } from "../../i18n/translations";
import { Toggle } from "../Toggle";
import type { LangCode } from "../../types";

// The three-tier consent card (base -> nested health + marketing), identical in
// wording and nesting to the kiosk's PreferencesStep.
//
// Shared by BOTH guest-facing surfaces — /checkin (QR self-check-in) and
// /previsit (pre-visit intake link). CLAUDE.md requires their consent copy stay
// identical because they capture the same data under the same consent model;
// sharing the component ENFORCES that rather than leaving it to be maintained
// twice. Do not fork this for one page: change it here or not at all.
//
// Unlike the kiosk there is no phone field (already entered on the previous
// screen) and no `prefilled` concept — the withdraw hints read off the toggles'
// own state.
export function ConsentSection({
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
  idPrefix = "checkin",
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
  idPrefix?: string;
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
          <label htmlFor={`${idPrefix}CrmName`} className="mb-2 block text-sm font-semibold text-charcoal">
            {t("consentNameLabel", lang)}
          </label>
          <input
            id={`${idPrefix}CrmName`}
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
                <label
                  htmlFor={`${idPrefix}CrmEmail`}
                  className="mb-2 block text-sm font-semibold text-charcoal"
                >
                  {t("consentMarketingEmailLabel", lang)}
                </label>
                <input
                  id={`${idPrefix}CrmEmail`}
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

// The full-card result state both guest pages end on (saved / withdrawn /
// invalid link / error). Shared for the same reason as the consent card: a
// guest should not be able to tell which of the two flows they were in from the
// shape of the confirmation.
export function StatusCard({
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
      <h1
        className={`${body ? "mb-2" : ""} font-serif text-2xl ${tone === "error" ? "text-rose-dark" : "text-charcoal"}`}
      >
        {title}
      </h1>
      {body && <p className="text-sm leading-relaxed text-slate-light">{body}</p>}
    </div>
  );
}
