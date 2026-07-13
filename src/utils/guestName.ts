// Combines the submitted guest names into a single display string, e.g.
// "Anna" for one guest or "Anna i Piotr" for a couple. Falls back to a
// generic greeting if nothing was entered yet.
export function guestDisplayName(guestNames: string[], partySize: number): string {
  const names = guestNames
    .slice(0, partySize)
    .map((n) => n.trim())
    .filter(Boolean);
  return names.length > 0 ? names.join(" i ") : "Gościu";
}
