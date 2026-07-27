import type {
  ComfortLabels,
  MusicPreference,
  OfferedPreferences,
  PillowPreference,
  Preferences,
} from "../types";
import { supabase } from "./supabase";
import { oils } from "../data/oils";
import type { LangCode } from "../i18n/translations";
import {
  musicTranslations,
  oilNameTranslations,
  oilSubtitleTranslations,
  pillowTranslations,
} from "../i18n/translations";

// ---------------------------------------------------------------------------
// Per-location comfort options — location_settings.comfort (migration 0027).
//
// Decides which comfort features a location offers at all, and (for the three
// list-valued ones) what the choices are. Pressure is deliberately absent: it
// is restricted per *service* instead (services.pressure_levels, 0023).
//
// Mirrors src/lib/branding.ts: an anon read for the kiosk, a manager write for
// /manage, and one normalizer both sides go through.
// ---------------------------------------------------------------------------

// A single choice. `name_i18n` follows services.name_i18n exactly: Polish is
// the required base, other languages are optional and fall back to it.
export interface ComfortOption {
  id: string;
  name_i18n: Record<string, string>;
  // Oils only — the small line under the name ("Relaksacyjny").
  subtitle_i18n?: Record<string, string>;
}

export interface ComfortSection {
  enabled: boolean;
  options: ComfortOption[];
}

export interface ComfortConfig {
  v: 1;
  oil: ComfortSection;
  music: ComfortSection;
  pillow: ComfortSection;
  // No option list: these are single controls, not menus.
  tableWarming: { enabled: boolean };
  communication: { enabled: boolean };
}

// The list-valued sections, keyed by the Preferences field they drive.
export const COMFORT_LIST_SECTIONS = ["oil", "music", "pillow"] as const;
export type ComfortListKey = (typeof COMFORT_LIST_SECTIONS)[number];

// Which Preferences field each list section fills in.
const FIELD_OF: Record<ComfortListKey, "oilId" | "music" | "headrestPillow"> = {
  oil: "oilId",
  music: "music",
  pillow: "headrestPillow",
};

const BUILTIN_MUSIC: MusicPreference[] = ["nature", "ambient", "silence"];
const BUILTIN_PILLOW: PillowPreference[] = ["Standardowa", "Ultra-miękka"];

// The built-in menu, i.e. what every location offered before 0027. Also what a
// `{}` config resolves to, so no row needs backfilling and the unpaired/?demo
// kiosk works with no DB read at all.
export function defaultComfortConfig(): ComfortConfig {
  return {
    v: 1,
    oil: {
      enabled: true,
      options: oils.map((o) => ({
        id: o.id,
        name_i18n: { ...(oilNameTranslations[o.id] ?? {}), pl: o.name },
        subtitle_i18n: { ...(oilSubtitleTranslations[o.id] ?? {}), pl: o.subtitle },
      })),
    },
    music: {
      enabled: true,
      options: BUILTIN_MUSIC.map((id) => ({ id, name_i18n: { ...musicTranslations[id] } })),
    },
    pillow: {
      enabled: true,
      options: BUILTIN_PILLOW.map((id) => ({ id, name_i18n: { ...pillowTranslations[id] } })),
    },
    tableWarming: { enabled: true },
    communication: { enabled: true },
  };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeOption(raw: unknown): ComfortOption | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!id) return null;
  const names = pickStringMap(r.name_i18n);
  // A nameless option would render as an unlabelled button — drop it.
  if (!names || Object.values(names).every((v) => !v.trim())) return null;
  const subtitles = pickStringMap(r.subtitle_i18n);
  const option: ComfortOption = { id, name_i18n: names };
  if (subtitles && Object.keys(subtitles).length > 0) option.subtitle_i18n = subtitles;
  return option;
}

function pickStringMap(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function normalizeSection(raw: unknown, fallback: ComfortSection): ComfortSection {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const enabled = typeof r.enabled === "boolean" ? r.enabled : fallback.enabled;
  const options = Array.isArray(r.options)
    ? (r.options.map(normalizeOption).filter(Boolean) as ComfortOption[])
    : [];
  // An enabled section with no usable options would render an empty card, so
  // it falls back to the built-ins rather than showing the guest nothing.
  return { enabled, options: options.length > 0 ? options : fallback.options };
}

function normalizeToggle(raw: unknown, fallback: boolean): { enabled: boolean } {
  if (!raw || typeof raw !== "object") return { enabled: fallback };
  const enabled = (raw as Record<string, unknown>).enabled;
  return { enabled: typeof enabled === "boolean" ? enabled : fallback };
}

// Merges a stored blob over the built-in defaults, section by section, dropping
// malformed options. `{}`, null, or a hand-mangled row all yield a usable
// config — the kiosk never has to handle a broken one.
export function normalizeComfort(raw: unknown): ComfortConfig {
  const defaults = defaultComfortConfig();
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;
  return {
    v: 1,
    oil: normalizeSection(r.oil, defaults.oil),
    music: normalizeSection(r.music, defaults.music),
    pillow: normalizeSection(r.pillow, defaults.pillow),
    tableWarming: normalizeToggle(r.tableWarming, defaults.tableWarming.enabled),
    communication: normalizeToggle(r.communication, defaults.communication.enabled),
  };
}

// ---------------------------------------------------------------------------
// Reading options
// ---------------------------------------------------------------------------

// `||` (not `??`) so a present-but-blank translation falls back to Polish
// rather than rendering an empty label — same rule as toMassageTypes()' pick.
export function comfortLabel(option: ComfortOption, lang: LangCode): string {
  const d = option.name_i18n;
  return d[lang] || d.pl || Object.values(d).find((v) => v) || option.id;
}

export function comfortSubtitle(option: ComfortOption, lang: LangCode): string {
  const d = option.subtitle_i18n;
  if (!d) return "";
  return d[lang] || d.pl || Object.values(d).find((v) => v) || "";
}

export function findComfortOption(section: ComfortSection, id: string | undefined) {
  return id ? section.options.find((o) => o.id === id) ?? null : null;
}

// The id to snap to when `current` isn't offered here, or null when it is (or
// when the section is off, in which case the value is dropped at submit
// anyway). Mirrors the per-service pressure clamp in PreferencesStep.
export function clampComfortId(section: ComfortSection, current: string): string | null {
  if (!section.enabled || section.options.length === 0) return null;
  if (section.options.some((o) => o.id === current)) return null;
  return section.options[0].id;
}

// ---------------------------------------------------------------------------
// Applying the config to a guest's preferences
// ---------------------------------------------------------------------------

// Drops every comfort field the location doesn't offer — the single place that
// decides what a disabled feature means for stored data (nothing at all, not a
// default value). Used by the intake write and by toStoredPreferences, so
// neither the therapist queue nor the CRM ever carries a phantom setting.
export function stripDisabled(p: Preferences, config: ComfortConfig): OfferedPreferences {
  const out: OfferedPreferences = { pressure: p.pressure };
  for (const key of COMFORT_LIST_SECTIONS) {
    const section = config[key];
    const value = p[FIELD_OF[key]];
    // An id the location no longer offers is dropped too: it would render as a
    // blank row for the therapist and re-prefill a stale choice for the guest.
    if (section.enabled && section.options.some((o) => o.id === value)) {
      out[FIELD_OF[key]] = value;
    }
  }
  if (config.tableWarming.enabled) out.tableWarming = p.tableWarming;
  if (config.communication.enabled) out.communication = p.communication;
  return out;
}

// Polish label snapshot for the ids that survived stripDisabled().
export function comfortLabelsFor(p: OfferedPreferences, config: ComfortConfig): ComfortLabels {
  const labels: ComfortLabels = {};
  const oil = findComfortOption(config.oil, p.oilId);
  const music = findComfortOption(config.music, p.music);
  const pillow = findComfortOption(config.pillow, p.headrestPillow);
  if (oil) labels.oil = comfortLabel(oil, "pl");
  if (music) labels.music = comfortLabel(music, "pl");
  if (pillow) labels.pillow = comfortLabel(pillow, "pl");
  return labels;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

// Kiosk-side read. Runs as anon under 0003's location_settings_read_anon
// policy, same bridge as branding and the price list.
export async function fetchComfort(locationId: string): Promise<ComfortConfig> {
  const { data, error } = await supabase
    .from("location_settings")
    .select("comfort")
    .eq("location_id", locationId)
    .maybeSingle();
  if (error) throw error;
  return normalizeComfort(data?.comfort ?? null);
}

// Manager write. location_settings is keyed by location_id, so this upserts the
// row the branding editor may or may not have created already. Per the RLS
// caveat in CLAUDE.md an RLS-blocked write is not an error, so the returned row
// count is what tells success from "matched nothing".
export async function saveComfort(locationId: string, config: ComfortConfig): Promise<void> {
  const { data, error } = await supabase
    .from("location_settings")
    .upsert({ location_id: locationId, comfort: config }, { onConflict: "location_id" })
    .select("location_id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Nie udało się zapisać ustawień komfortu (brak uprawnień?).");
  }
}
