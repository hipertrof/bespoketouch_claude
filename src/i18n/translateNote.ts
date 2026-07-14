import type { LangCode } from "./translations";

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

export async function translateNote(text: string, targetLang: LangCode): Promise<string> {
  const target = DEEPL_TARGET[targetLang];
  if (!target) {
    throw new Error("Ten język nie wymaga tłumaczenia.");
  }

  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLang: target, sourceLang: "PL" }),
  });

  const data = (await res.json()) as { translatedText?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Tłumaczenie nie powiodło się.");
  }
  return data.translatedText ?? "";
}
