import { supabase } from "./supabase";

// Per-location kiosk branding, stored in location_settings.branding (jsonb).
// {} / null = stock BespokeTouch look. Only the page background (the cream
// neutral) is re-themed; text colors, accents, and everything else stay stock,
// which is what keeps arbitrary client colors readable.
export interface LocationBranding {
  version?: number;
  // #rrggbb page background, replacing --color-cream. Lightness-clamped on
  // application so charcoal text always reads.
  background?: string;
  // Storage path inside the "branding" bucket (kept so a re-upload/removal can
  // delete the old object) + its public URL, which is what the kiosk renders.
  logoPath?: string;
  logoUrl?: string;
}

// Stock background from src/index.css @theme — the editor default.
export const STOCK_BACKGROUND = "#f9f6ef"; // cream

// --- hex <-> HSL (h in [0,360), s/l in [0,1]) ---

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Readability guardrail for the page background: keep it light enough for
// charcoal text (stock cream is L≈0.96) and calm enough not to swallow the
// UI's whites and sand borders.
export function normalizeBackground(hex: string): string | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  return hslToHex(hsl.h, clamp(hsl.s, 0, 0.5), clamp(hsl.l, 0.85, 0.99));
}

// Map branding onto the Tailwind v4 @theme custom properties (src/index.css).
// Applied as an inline style on the kiosk root, so CSS inheritance scopes the
// override to the kiosk; dashboards keep the :root values. Used identically by
// the /manage editor preview so it's WYSIWYG.
export function brandCssVars(branding: LocationBranding | null): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!branding) return vars;
  const background = branding.background ? normalizeBackground(branding.background) : null;
  if (background) vars["--color-cream"] = background;
  return vars;
}

// Kiosk-side read. Runs as anon: 0003's location_settings_read_anon policy
// permits it for active locations, same bridge as the price list.
export async function fetchBranding(locationId: string): Promise<LocationBranding | null> {
  const { data, error } = await supabase
    .from("location_settings")
    .select("branding")
    .eq("location_id", locationId)
    .maybeSingle();
  if (error) throw error;
  const branding = (data?.branding ?? null) as LocationBranding | null;
  return branding && Object.keys(branding).length > 0 ? branding : null;
}
