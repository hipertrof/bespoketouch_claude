import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LangCode } from "../types";

// Global UI language for the staff surfaces that live outside the kiosk's
// GuestProvider (login, offer CMS). Defaults to Polish and persists the choice
// so a non-Polish-speaking manager keeps their language across visits. The
// kiosk flow keeps its own per-session language in GuestContext.
const STORAGE_KEY = "bt_lang";
const SUPPORTED: LangCode[] = ["pl", "en", "uk", "it", "fr", "de", "es", "id"];

function readInitial(): LangCode {
  // A cookie-blocked or sandboxed browser can have `localStorage` defined but
  // throw SecurityError on access — reading it unguarded here would throw inside
  // the useState initializer and blank the whole app. Fall back to Polish.
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as LangCode | null;
    return stored && SUPPORTED.includes(stored) ? stored : "pl";
  } catch {
    return "pl";
  }
}

interface LanguageContextValue {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(readInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore (private mode / disabled storage)
    }
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang: setLangState }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
