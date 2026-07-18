import type { LangCode, MassageType } from "../types";
import { supabase } from "./supabase";
import { massageTypes } from "../data/massageTypes";
import { massageNameTranslations } from "../i18n/translations";

// ---------------------------------------------------------------------------
// DB row shapes (public.services / public.service_durations from 0001_schema).
// ---------------------------------------------------------------------------

export interface ServiceRow {
  id: string;
  location_id: string;
  name_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  active: boolean;
  sort: number;
}

export interface ServiceDurationRow {
  id: string;
  service_id: string;
  minutes: number;
  price_single: number | null;
  price_couple: number | null;
  couple_available: boolean;
}

// A service joined with its durations — the CMS edit unit.
export interface CatalogService extends ServiceRow {
  durations: ServiceDurationRow[];
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

// Full catalogue for a location (all services + durations), for the CMS.
// Ordered by sort then name so the manager sees a stable list.
export async function fetchCatalog(locationId: string): Promise<CatalogService[]> {
  const { data: services, error: sErr } = await supabase
    .from("services")
    .select("*")
    .eq("location_id", locationId)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (sErr) throw sErr;
  if (!services || services.length === 0) return [];

  const ids = services.map((s) => s.id);
  const { data: durations, error: dErr } = await supabase
    .from("service_durations")
    .select("*")
    .in("service_id", ids)
    .order("minutes", { ascending: true });
  if (dErr) throw dErr;

  return (services as ServiceRow[]).map((s) => ({
    ...s,
    durations: (durations as ServiceDurationRow[]).filter((d) => d.service_id === s.id),
  }));
}

// The bundled Nusa catalogue expressed in the DB CatalogService[] shape, so the
// kiosk's offline/fallback path flows through the exact same toMassageTypes()
// mapper as the DB path (one code path, no per-source branching downstream).
// Used when the device is unpaired (?demo), or the DB fetch fails / is empty.
export function bundledCatalog(): CatalogService[] {
  return massageTypes.map((m, i) => ({
    id: m.id,
    location_id: "bundled",
    name_i18n: { ...(massageNameTranslations[m.id] ?? {}), pl: m.name },
    description_i18n: {},
    active: true,
    sort: i,
    durations: m.durations.map((d) => ({
      id: `${m.id}-${d.minutes}`,
      service_id: m.id,
      minutes: d.minutes,
      price_single: d.priceSingle ?? null,
      price_couple: d.priceCouple ?? null,
      couple_available: d.priceCouple !== undefined,
    })),
  }));
}

// Maps a DB catalogue to the app's existing MassageType[] shape, so the kiosk
// flow (WelcomeStep, GuestContext, MasseurDashboard) can consume it unchanged.
// `lang` picks the display name/description; falls back to pl then any value.
export function toMassageTypes(catalog: CatalogService[], lang: LangCode): MassageType[] {
  // `||` (not `??`) so a present-but-blank translation ("" — e.g. a CMS field
  // left empty) falls back to Polish rather than rendering an empty name.
  const pick = (dict: Record<string, string>): string =>
    dict[lang] || dict.pl || Object.values(dict).find((v) => v) || "";
  return catalog
    .filter((s) => s.active)
    .map((s) => ({
      id: s.id,
      name: pick(s.name_i18n),
      description: pick(s.description_i18n),
      durations: s.durations.map((d) => ({
        minutes: d.minutes,
        priceSingle: d.price_single ?? undefined,
        priceCouple: d.couple_available ? d.price_couple ?? undefined : undefined,
      })),
    }));
}

// ---------------------------------------------------------------------------
// Seed: import the bundled Nusa catalogue into a location's services.
// One-click bootstrap so a new location starts with a real offer instead of a
// blank CMS. Idempotency is the caller's concern (we warn if services exist).
// ---------------------------------------------------------------------------

export async function importDefaultCatalog(locationId: string): Promise<number> {
  let imported = 0;
  for (let i = 0; i < massageTypes.length; i++) {
    const m = massageTypes[i];
    // pl name comes from the bundled catalogue; other languages from the i18n
    // name map. Descriptions are not stored (removed from the offer model).
    const nameI18n: Record<string, string> = {
      ...(massageNameTranslations[m.id] ?? {}),
      pl: m.name,
    };
    const { data: svc, error: sErr } = await supabase
      .from("services")
      .insert({
        location_id: locationId,
        name_i18n: nameI18n,
        active: true,
        sort: i,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    const rows = m.durations.map((d) => ({
      service_id: svc.id,
      minutes: d.minutes,
      price_single: d.priceSingle ?? null,
      price_couple: d.priceCouple ?? null,
      couple_available: d.priceCouple !== undefined,
    }));
    const { error: dErr } = await supabase.from("service_durations").insert(rows);
    if (dErr) throw dErr;
    imported++;
  }
  return imported;
}
