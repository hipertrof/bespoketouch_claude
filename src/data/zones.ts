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
