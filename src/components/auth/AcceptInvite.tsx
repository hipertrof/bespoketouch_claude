import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { supabase } from "../../lib/supabase";
import { t } from "../../i18n/translations";
import { Button } from "../Button";
import { Logo } from "../Logo";
import { LanguageSelector } from "../LanguageSelector";

// Landing page for invite links (/welcome). The invite link verifies the token
// at Supabase and redirects here with a session in the URL hash, which the
// supabase-js client picks up (detectSessionInUrl). The invited person then sets
// a password and is sent on to the dashboards. Also serves password-recovery.
export function AcceptInvite() {
  const { user, loading } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The client parses the invite tokens from the URL hash asynchronously; give it
  // a grace period before deciding the link is invalid, to avoid a false flash.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const hasHashToken = /access_token|type=(invite|recovery|signup)/.test(window.location.hash);
    if (!hasHashToken) {
      setSettled(true);
      return;
    }
    const timer = setTimeout(() => setSettled(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("welcomePwShort", lang));
      return;
    }
    if (password !== confirm) {
      setError(t("welcomePwMismatch", lang));
      return;
    }
    setBusy(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) throw upErr;
      setDone(true);
      setTimeout(() => navigate("/staff"), 1400);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  const showSpinner = !user && (loading || !settled);
  const invalidLink = !user && settled && !loading;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-6">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <LanguageSelector />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-3xl bg-white p-8 shadow-soft">
          {showSpinner ? (
            <p className="text-center text-slate">{t("welcomeActivating", lang)}</p>
          ) : invalidLink ? (
            <p className="text-center text-sm text-rose-dark">{t("welcomeInvalidLink", lang)}</p>
          ) : done ? (
            <p className="text-center text-sage-dark">{t("welcomeDone", lang)}</p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div className="text-center">
                <h1 className="font-serif text-2xl text-charcoal">{t("welcomePwTitle", lang)}</h1>
                <p className="mt-1 text-sm text-slate">{t("welcomeSubtitle", lang)}</p>
                {user?.email && <p className="mt-1 text-xs text-slate-light">{user.email}</p>}
              </div>
              <label className="flex flex-col gap-1 text-sm text-slate">
                {t("password", lang)}
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-h-12 rounded-2xl border border-sand bg-cream px-4 text-charcoal outline-none focus:border-sage"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate">
                {t("welcomeConfirm", lang)}
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="min-h-12 rounded-2xl border border-sand bg-cream px-4 text-charcoal outline-none focus:border-sage"
                />
              </label>
              {error && <p className="text-sm text-rose-dark">{error}</p>}
              <Button type="submit" disabled={busy} className="mt-2 w-full">
                {busy ? t("welcomeSubmitting", lang) : t("welcomeSubmit", lang)}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
