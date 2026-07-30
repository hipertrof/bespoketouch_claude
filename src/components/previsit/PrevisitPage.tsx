import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarCheck, Search } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { clampStoredToOffer, isCodeError } from "../../lib/checkin";
import { previsitLookup, previsitSave, type PrevisitVisitSummary } from "../../lib/previsit";
import type { StoredPreferences } from "../../lib/guestProfile";
import { defaultComfortConfig, type ComfortConfig } from "../../lib/comfort";
import { ALL_PRESSURE_LEVELS } from "../../lib/catalog";
import { t } from "../../i18n/translations";
import { Button } from "../Button";
import { LanguageSelector } from "../LanguageSelector";
import { ConsentSection, StatusCard } from "../checkin/ConsentSection";
import { CheckinPrefsEditor } from "../checkin/CheckinPrefsEditor";
import type { LangCode, PressureLevel } from "../../types";

// No "notFound": unlike /checkin, a guest with nothing stored is EXPECTED here —
// a first-timer filling in a link before their first visit is the whole point —
// so a blank profile starts them from defaults instead of dead-ending.
type Stage = "phone" | "looking" | "editing" | "saving" | "saved" | "linkInvalid" | "error";

// A first-time guest with nothing remembered starts from the same shape a fresh
// kiosk guest would: v2, no comfort ids (the editor's own defaults fill in), no
// zones or notes.
const emptyPrefs = (): StoredPreferences => ({ v: 2 });

// Anonymous page reached from a link the spa sent the guest BEFORE their
// appointment (created by reception on /upcoming). No AuthProvider or
// DeviceProvider — see api/_previsitCore.ts for the trust model. Its credential
// has two parts, because unlike the kiosk's QR this link travels through e-mail
// or SMS and can be forwarded:
//   1. the `c` code in the URL;
//   2. the phone number the spa recorded at booking, typed in below.
// A wrong phone is reported exactly like a wrong link, so the page cannot be
// used to test whether a given number is a guest here.
//
// The consent card, the result card and both credential helpers are shared with
// /checkin — the two surfaces capture the same data under the same consent model
// and their copy must stay identical.
export function PrevisitPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("c");
  const { lang } = useLanguage();

  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>(code ? "phone" : "linkInvalid");
  const [visit, setVisit] = useState<PrevisitVisitSummary | null>(null);
  const [prefs, setPrefs] = useState<StoredPreferences | null>(null);
  const [comfort, setComfort] = useState<ComfortConfig>(() => defaultComfortConfig());
  // No treatment is picked at mint time, so the lookup returns the union across
  // the location's active services — same as /checkin.
  const [pressureLevels, setPressureLevels] = useState<PressureLevel[]>(ALL_PRESSURE_LEVELS);
  // Base consent starts ON so the common case (the guest wants the spa to
  // remember their preferences) is one fewer tap; switching it off is the
  // withdrawal path and forces the nested tiers off too.
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
      const found = await previsitLookup(code, phone);
      setVisit(found.visit);
      // Clamp once, here: a remembered pressure/oil/music/pillow the location no
      // longer offers would otherwise stay selected-but-invisible and be saved
      // straight back.
      setPrefs(
        clampStoredToOffer(found.preferences ?? emptyPrefs(), found.comfort, found.pressureLevels),
      );
      setComfort(found.comfort);
      setPressureLevels(found.pressureLevels);
      setHealthConsent(found.healthConsent);
      setMarketingConsent(found.marketingConsent);
      // Reception typed a name at booking, so this is prefilled even for a guest
      // with no CRM row yet.
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
      const contact = consent && marketingConsent ? { email: crmEmail.trim() || undefined } : undefined;
      await previsitSave(
        code,
        phone,
        prefs,
        consent,
        healthConsent,
        consent ? crmName.trim() : "",
        contact,
      );
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
          <CalendarCheck size={12} />
          {t("previsitGreeting", lang)}
        </span>
        <LanguageSelector />
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {stage === "linkInvalid" && (
          <StatusCard title={t("previsitLinkInvalid", lang)} body={t("previsitLinkExpiredInfo", lang)} />
        )}

        {stage === "error" && <StatusCard title={t("checkinError", lang)} tone="error" />}

        {(stage === "phone" || stage === "looking") && (
          <div className="rounded-2xl border border-sand bg-white p-6 shadow-soft">
            <h1 className="mb-2 font-serif text-2xl text-charcoal">{t("previsitGreeting", lang)}</h1>
            <p className="mb-5 text-sm leading-relaxed text-slate-light">{t("previsitPhonePrompt", lang)}</p>
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

        {(stage === "editing" || stage === "saving") && prefs && (
          <div className="flex flex-col gap-6">
            {visit && <VisitSummaryCard visit={visit} lang={lang} />}
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
              idPrefix="previsit"
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
            body={t("previsitSavedInfo", lang)}
            tone="success"
          />
        )}

        {stage === "saved" && consent && (
          <StatusCard title={t("previsitSaved", lang)} body={t("previsitSavedInfo", lang)} tone="success" />
        )}
      </div>
    </div>
  );
}

// What the guest is answering for. Without it the page is a context-free
// questionnaire; with it they can confirm the spa has the right booking before
// they type anything about their body into it.
function VisitSummaryCard({ visit, lang }: { visit: PrevisitVisitSummary; lang: LangCode }) {
  const details = [
    visit.treatmentName,
    visit.minutes ? `${visit.minutes} min` : null,
    visit.therapistName,
    visit.roomName,
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-light">
        {t("previsitVisitSummary", lang)}
      </div>
      <div className="mt-1.5 font-serif text-xl text-charcoal">{visit.guestName}</div>
      {details.length > 0 && <div className="mt-1 text-sm text-slate">{details.join(" · ")}</div>}
      {visit.locationName && <div className="mt-0.5 text-sm text-slate-light">{visit.locationName}</div>}
    </div>
  );
}
