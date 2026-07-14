import type { LangCode } from "../types";
import { t } from "../i18n/translations";

// Combines the submitted guest names into a single display string, e.g.
// "Anna" for one guest or "Anna i Piotr" for a couple (joiner localized).
// Falls back to a generic, localized greeting if nothing was entered yet.
export function guestDisplayName(
  guestNames: string[],
  partySize: number,
  lang: LangCode = "pl",
): string {
  const names = guestNames
    .slice(0, partySize)
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length === 0) return t("guestVocative", lang);
  return names.join(` ${t("nameAnd", lang)} `);
}
