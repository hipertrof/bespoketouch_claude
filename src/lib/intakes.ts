import type { PartySize, PersonalizationState, TreatmentSelection } from "../types";
import { supabase } from "./supabase";
import type { CatalogService } from "./catalog";

// ---------------------------------------------------------------------------
// Intake shapes (public.intakes from 0001_schema, policies in 0005_intakes).
//
// An intake is the self-contained snapshot of one visit that the guest locks on
// the handoff screen. It carries a *snapshot* of the chosen treatment (name in
// every language + resolved price) so the therapist queue can render it without
// re-reading the live offer — and so a later price/name edit can't rewrite a
// past visit record.
// ---------------------------------------------------------------------------

export interface TreatmentSnapshot {
  treatmentId: string | null;
  minutes: number | null;
  // All languages, so a therapist can switch the summary language in the queue.
  nameI18n: Record<string, string> | null;
  // Resolved for the visit's party size (single vs couple), in PLN.
  price: number | null;
}

export interface IntakeRow {
  id: string;
  location_id: string;
  status: string;
  party_size: number;
  guest_names: string[];
  treatment_selections: TreatmentSnapshot[];
  personalizations: PersonalizationState[];
  created_at: string;
  expires_at: string | null;
}

// How long a locked intake stays in the queue before the retention job may
// purge it (no job yet — this just stamps the target). Two days covers a
// same-day treatment plus slack for late checkout.
const RETENTION_HOURS = 48;

// ---------------------------------------------------------------------------
// Snapshot builder — resolves each selection against the loaded catalogue into
// a display-ready snapshot. Mirrors toMassageTypes()' price rule (couple price
// only when couple_available).
// ---------------------------------------------------------------------------

export function buildTreatmentSnapshots(
  selections: TreatmentSelection[],
  partySize: PartySize,
  catalog: CatalogService[],
): TreatmentSnapshot[] {
  return selections.map((sel) => {
    const service = catalog.find((s) => s.id === sel.treatmentId);
    const duration = service?.durations.find((d) => d.minutes === sel.treatmentMinutes);
    let price: number | null = null;
    if (duration) {
      price =
        partySize === 1
          ? duration.price_single
          : duration.couple_available
            ? duration.price_couple
            : null;
    }
    return {
      treatmentId: sel.treatmentId,
      minutes: sel.treatmentMinutes,
      nameI18n: service ? service.name_i18n : null,
      price,
    };
  });
}

// ---------------------------------------------------------------------------
// Writes (kiosk, anon role — insert only per 0005 RLS)
// ---------------------------------------------------------------------------

export async function saveIntake(input: {
  locationId: string;
  partySize: PartySize;
  guestNames: string[];
  treatmentSelections: TreatmentSnapshot[];
  personalizations: PersonalizationState[];
}): Promise<string> {
  const expiresAt = new Date(Date.now() + RETENTION_HOURS * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("intakes")
    .insert({
      location_id: input.locationId,
      status: "submitted",
      party_size: input.partySize,
      guest_names: input.guestNames,
      treatment_selections: input.treatmentSelections,
      personalizations: input.personalizations,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Reads (staff dashboards, authenticated role — scoped by RLS to the caller's
// accessible locations)
// ---------------------------------------------------------------------------

// Newest first. `location_id` is server-filtered; RLS still enforces access.
export async function fetchIntakes(locationId: string): Promise<IntakeRow[]> {
  const { data, error } = await supabase
    .from("intakes")
    .select("*")
    .eq("location_id", locationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as IntakeRow[];
}

export async function updateIntakeStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase.from("intakes").update({ status }).eq("id", id);
  if (error) throw error;
}
