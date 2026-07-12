import type { BodyView, ZoneId } from "../../types";

export interface MarkerPosition {
  zoneId: ZoneId;
  left: number;
  top: number;
}

// Percentages relative to the body-map container (traced figure, viewBox ~305-308 x 972-982).
export const frontMarkers: MarkerPosition[] = [
  { zoneId: "scalp", left: 50, top: 3 },
  { zoneId: "face", left: 50, top: 9 },
  { zoneId: "decolletage", left: 50, top: 18 },
  { zoneId: "chest", left: 50, top: 25 },
  { zoneId: "abdomen", left: 50, top: 37 },
  { zoneId: "upperArmsFront", left: 16, top: 29 },
  { zoneId: "upperArmsFront", left: 84, top: 29 },
  { zoneId: "forearmsFront", left: 11, top: 44 },
  { zoneId: "forearmsFront", left: 89, top: 44 },
  { zoneId: "hands", left: 9, top: 52 },
  { zoneId: "hands", left: 91, top: 52 },
  { zoneId: "thighsFront", left: 40, top: 61 },
  { zoneId: "thighsFront", left: 60, top: 61 },
  { zoneId: "shins", left: 43, top: 82 },
  { zoneId: "shins", left: 57, top: 82 },
  { zoneId: "feetTop", left: 42, top: 96 },
  { zoneId: "feetTop", left: 58, top: 96 },
];

export const backMarkers: MarkerPosition[] = [
  { zoneId: "nape", left: 50, top: 11 },
  { zoneId: "shoulders", left: 50, top: 17 },
  { zoneId: "upperBack", left: 50, top: 22 },
  { zoneId: "lowerBack", left: 50, top: 33 },
  { zoneId: "upperArmsBack", left: 16, top: 29 },
  { zoneId: "upperArmsBack", left: 84, top: 29 },
  { zoneId: "forearmsBack", left: 11, top: 44 },
  { zoneId: "forearmsBack", left: 89, top: 44 },
  { zoneId: "glutes", left: 50, top: 46 },
  { zoneId: "thighsBack", left: 40, top: 61 },
  { zoneId: "thighsBack", left: 60, top: 61 },
  { zoneId: "calves", left: 43, top: 82 },
  { zoneId: "calves", left: 57, top: 82 },
  { zoneId: "feetSole", left: 42, top: 96 },
  { zoneId: "feetSole", left: 58, top: 96 },
];

export function markersForView(view: BodyView): MarkerPosition[] {
  return view === "front" ? frontMarkers : backMarkers;
}
