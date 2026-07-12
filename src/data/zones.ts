import type { ZoneDefinition } from "../types";

export const zoneDefinitions: ZoneDefinition[] = [
  // Przód
  { id: "scalp", label: "Głowa (skóra głowy)", view: "front" },
  { id: "face", label: "Twarz", view: "front" },
  { id: "decolletage", label: "Dekolt", view: "front" },
  { id: "chest", label: "Klatka piersiowa", view: "front" },
  { id: "abdomen", label: "Brzuch", view: "front" },
  { id: "upperArmsFront", label: "Ramiona", view: "front" },
  { id: "forearmsFront", label: "Przedramiona", view: "front" },
  { id: "hands", label: "Dłonie", view: "front" },
  { id: "thighsFront", label: "Uda", view: "front" },
  { id: "shins", label: "Podudzia / Golenie", view: "front" },
  { id: "feetTop", label: "Stopy (wierzch)", view: "front" },
  // Tył
  { id: "nape", label: "Kark", view: "back" },
  { id: "shoulders", label: "Barki", view: "back" },
  { id: "upperBack", label: "Górny grzbiet", view: "back" },
  { id: "lowerBack", label: "Dolny grzbiet", view: "back" },
  { id: "upperArmsBack", label: "Ramiona (tył)", view: "back" },
  { id: "forearmsBack", label: "Przedramiona (tył)", view: "back" },
  { id: "glutes", label: "Pośladki", view: "back" },
  { id: "thighsBack", label: "Uda (tył)", view: "back" },
  { id: "calves", label: "Łydki", view: "back" },
  { id: "feetSole", label: "Stopy (podeszwa)", view: "back" },
];

export const zoneLabel = (id: string): string =>
  zoneDefinitions.find((z) => z.id === id)?.label ?? id;

// Base name of a label, ignoring any existing parenthetical (e.g. both
// "Ramiona" and "Ramiona (tył)" reduce to "Ramiona").
const baseName = (label: string): string => label.replace(/\s*\(.*\)$/, "");

// Base names shared by more than one zone (Ramiona, Uda, Przedramiona, Stopy…)
// — these need a przód/tył suffix to be unambiguous in a flat list.
const ambiguousBases = new Set(
  zoneDefinitions
    .map((z) => baseName(z.label))
    .filter((name, _, all) => all.filter((n) => n === name).length > 1),
);

// Label for a zone shown out of context (summary chips, masseur notes): adds a
// przód/tył suffix only when the plain label would be ambiguous and doesn't
// already carry its own parenthetical.
export const zoneSummaryLabel = (id: string): string => {
  const def = zoneDefinitions.find((z) => z.id === id);
  if (!def) return id;
  if (!ambiguousBases.has(baseName(def.label))) return def.label;
  if (/\(.*\)$/.test(def.label)) return def.label;
  return `${def.label} (${def.view === "front" ? "przód" : "tył"})`;
};
