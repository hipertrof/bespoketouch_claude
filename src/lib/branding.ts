import { supabase } from "./supabase";

// Per-location kiosk branding, stored in location_settings.branding (jsonb).
// {} / null = stock BespokeTouch look. Only the two accent families (clay =
// primary, sage = secondary) are re-themed; neutrals (cream/charcoal/slate/
// sand/rose) stay stock, which is what keeps arbitrary client colors readable.
export interface LocationBranding {
  version?: number;
  // #rrggbb accent bases; shade variants are derived, never stored.
  primary?: string;
  secondary?: string;
  // Storage path inside the "branding" bucket (kept so a re-upload/removal can
  // delete the old object) + its public URL, which is what the kiosk renders.
  logoPath?: string;
  logoUrl?: string;
}

// Stock accent bases from src/index.css @theme — editor defaults.
export const STOCK_PRIMARY = "#c99a6a"; // clay
export const STOCK_SECONDARY = "#5f6b52"; // sage

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

// Derive the -light/-dark/-tint family from a base accent, mirroring the stock
// clay ratios. The lightness clamps are the readability guardrail: base stays
// mid-range, dark stays dark enough for cream/white text (~4.5:1), tint stays a
// near-white wash so charcoal text always reads.
export function deriveShades(
  hex: string,
): { base: string; light: string; dark: string; tint: string } | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  const { h, s } = hsl;
  const L = clamp(hsl.l, 0.28, 0.62);
  return {
    base: hslToHex(h, s, L),
    light: hslToHex(h, s * 0.85, clamp(L + 0.16, 0, 0.8)),
    dark: hslToHex(h, s, clamp(L - 0.14, 0.18, 0.4)),
    tint: hslToHex(h, clamp(s * 0.45, 0, 0.35), 0.92),
  };
}

// Map branding onto the Tailwind v4 @theme custom properties (src/index.css).
// Applied as an inline style on the kiosk root, so CSS inheritance scopes the
// override to the kiosk; dashboards keep the :root values. Used identically by
// the /manage editor preview so it's WYSIWYG.
export function brandCssVars(branding: LocationBranding | null): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!branding) return vars;
  const primary = branding.primary ? deriveShades(branding.primary) : null;
  if (primary) {
    vars["--color-clay"] = primary.base;
    vars["--color-clay-light"] = primary.light;
    vars["--color-clay-dark"] = primary.dark;
    vars["--color-clay-tint"] = primary.tint;
  }
  const secondary = branding.secondary ? deriveShades(branding.secondary) : null;
  if (secondary) {
    vars["--color-sage"] = secondary.base;
    vars["--color-sage-light"] = secondary.light;
    vars["--color-sage-dark"] = secondary.dark;
    vars["--color-sage-tint"] = secondary.tint;
  }
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
