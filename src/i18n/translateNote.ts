import type { LangCode } from "./translations";
import { supabase } from "../lib/supabase";

const DEEPL_TARGET: Partial<Record<LangCode, string>> = {
  en: "EN-US",
  id: "ID",
  uk: "UK",
  it: "IT",
  fr: "FR",
  de: "DE",
  es: "ES",
};

export function isTranslatable(lang: LangCode): boolean {
  return lang in DEEPL_TARGET;
}

// The endpoint requires a caller identity. Staff dashboards authenticate with
// the signed-in Supabase JWT; the on-kiosk therapist panel has no login, so it
// passes its paired device token instead. Attach whichever is available.
export async function translateNote(
  text: string,
  targetLang: LangCode,
  opts?: { deviceToken?: string | null },
): Promise<string> {
  const target = DEEPL_TARGET[targetLang];
  if (!target) {
    throw new Error("Ten język nie wymaga tłumaczenia.");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  const res = await fetch("/api/translate", {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      targetLang: target,
      sourceLang: "PL",
      deviceToken: opts?.deviceToken ?? undefined,
    }),
  });

  const result = (await res.json().catch(() => null)) as
    | { translatedText?: string; error?: string }
    | null;
  if (!res.ok) {
    throw new Error(result?.error ?? "Tłumaczenie nie powiodło się.");
  }
  return result?.translatedText ?? "";
}
