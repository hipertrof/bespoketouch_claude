import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { useDevice } from "../../context/DeviceContext";
import { useLanguage } from "../../context/LanguageContext";
import { t } from "../../i18n/translations";
import { Button } from "../Button";
import { LanguageSelector } from "../LanguageSelector";

// Shown by the kiosk gate when the device has no valid token. Front-desk enters
// the 6-digit code minted in the manager "Kiosks" dashboard to bind this tablet
// to a location.
export function ActivationScreen() {
  const { pair } = useDevice();
  const { lang } = useLanguage();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = code.replace(/\D/g, "").slice(0, 6);
  const ready = digits.length === 6;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pair(digits);
      // On success the provider flips to "paired" and the gate renders the kiosk.
    } catch {
      setError(t("activateInvalid", lang));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <div className="flex justify-end p-4">
        <LanguageSelector />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <form
          onSubmit={submit}
          className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-soft"
        >
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sage-tint text-sage-dark">
            <KeyRound size={30} strokeWidth={1.5} />
          </div>
          <h1 className="mb-3 font-serif text-2xl text-charcoal">{t("activateTitle", lang)}</h1>
          <p className="mb-6 text-sm leading-relaxed text-slate">{t("activateBody", lang)}</p>

          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={digits}
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
            }}
            placeholder="000000"
            className="mb-4 w-full rounded-2xl border border-sand bg-cream px-4 py-4 text-center font-mono text-3xl tracking-[0.4em] text-charcoal outline-none transition-all duration-300 focus:border-clay focus:ring-4 focus:ring-clay/15"
          />
          {error && <p className="mb-4 text-sm text-rose-dark">{error}</p>}
          <Button type="submit" disabled={!ready || busy} className="w-full justify-center">
            {busy ? t("activating", lang) : t("activateEnter", lang)}
          </Button>
        </form>
      </div>
    </div>
  );
}
