import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { X } from "lucide-react";
import { mintCheckinCode } from "../../lib/checkin";
import { t } from "../../i18n/translations";
import { Button } from "../Button";
import type { LangCode } from "../../types";

// Full-screen QR the receptionist hands to a guest who'd rather not say their
// phone number aloud. Mints a fresh short-lived code on open (device-token-
// authed, api/_checkinCore.ts "mint") and encodes a link to the anonymous
// /checkin page; the guest scans it on their OWN phone from there. Closing and
// reopening always mints again — codes are single-use-on-save and short-lived,
// so there's no reason to cache one across opens.
export function CheckinQrModal({
  deviceToken,
  lang,
  onClose,
}: {
  deviceToken: string;
  lang: LangCode;
  onClose: () => void;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const mountedRef = useRef(true);

  const mint = async () => {
    setSvg(null);
    setError(null);
    try {
      const { code, expiresAt: expires } = await mintCheckinCode(deviceToken);
      if (!mountedRef.current) return;
      const url = `${window.location.origin}/checkin?c=${code}`;
      const markup = await QRCode.toString(url, { type: "svg", margin: 1, width: 288 });
      if (!mountedRef.current) return;
      setSvg(markup);
      setExpiresAt(expires);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : t("checkinError", lang));
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    mint();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsLeft = expiresAt ? Math.max(0, Math.round((Date.parse(expiresAt) - now) / 1000)) : null;
  const mm = secondsLeft !== null ? String(Math.floor(secondsLeft / 60)).padStart(2, "0") : "--";
  const ss = secondsLeft !== null ? String(secondsLeft % 60).padStart(2, "0") : "--";
  const expired = secondsLeft !== null && secondsLeft <= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/70 p-4">
      <div className="relative w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-soft">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close", lang)}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-slate-light hover:bg-oatmeal"
        >
          <X size={20} />
        </button>

        <h2 className="mb-2 font-serif text-2xl text-charcoal">{t("checkinQrTitle", lang)}</h2>
        <p className="mb-6 text-sm leading-relaxed text-slate-light">{t("checkinQrInstruction", lang)}</p>

        <div className="mx-auto mb-6 flex h-72 w-72 items-center justify-center rounded-2xl border border-sand bg-oatmeal/30">
          {error ? (
            <p className="px-4 text-sm text-rose-dark">{error}</p>
          ) : svg && !expired ? (
            <div className="h-72 w-72 p-4" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : expired ? (
            <p className="px-4 text-sm text-slate-light">{t("checkinLinkExpired", lang)}</p>
          ) : (
            <p className="text-sm text-slate-light">…</p>
          )}
        </div>

        {!error && secondsLeft !== null && (
          <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-slate-light">
            {t("checkinQrExpiresLabel", lang)} {mm}:{ss}
          </p>
        )}

        <Button variant="secondary" onClick={mint} className="w-full">
          {t("checkinQrRefresh", lang)}
        </Button>
      </div>
    </div>
  );
}
