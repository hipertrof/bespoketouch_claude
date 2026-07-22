import type {
  PartySize,
  PersonalizationState,
  TherapistAssignment,
  TreatmentSelection,
} from "../types";
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

// status is free text, no DB constraint. Known values: "submitted" (normal
// kiosk handoff), "done" (archived, Article-9-scrubbed by 0018), and
// "incomplete" (QR self-check-in — api/_checkinCore.ts — missing guest name /
// therapist / treatment until reception fills them in via completeIntake).
export interface IntakeRow {
  id: string;
  location_id: string;
  status: string;
  party_size: number;
  guest_names: string[];
  treatment_selections: TreatmentSnapshot[];
  personalizations: PersonalizationState[];
  // Index-aligned with guest_names; null = no therapist assigned. Absent on
  // rows written before 0009 — treat as [].
  therapists: (TherapistAssignment | null)[] | null;
  created_at: string;
  expires_at: string | null;
}

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
  // A couple price only means anything when both guests share ONE treatment —
  // it's the package rate for that treatment done together. When the two guests
  // pick different treatments there is no couple rate, so we show no price at
  // all rather than a misleading (and double-countable) number.
  const differentCoupleTreatments =
    partySize === 2 &&
    selections.length === 2 &&
    selections[0]?.treatmentId !== selections[1]?.treatmentId;

  return selections.map((sel) => {
    const service = catalog.find((s) => s.id === sel.treatmentId);
    const duration = service?.durations.find((d) => d.minutes === sel.treatmentMinutes);
    let price: number | null = null;
    if (duration && !differentCoupleTreatments) {
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
// Writes (kiosk → /api/intake, authenticated by the paired device token)
//
// Phase 2 hardening moved this off the anon RLS insert bridge (dropped in
// migration 0012). The kiosk no longer says which location it is writing to —
// it presents its device token and the server derives the location, pinning
// status and expires_at server-side. An unpaired tablet simply cannot write.
// ---------------------------------------------------------------------------

export async function saveIntake(input: {
  deviceToken: string;
  partySize: PartySize;
  guestNames: string[];
  treatmentSelections: TreatmentSnapshot[];
  personalizations: PersonalizationState[];
  therapists: (TherapistAssignment | null)[];
}): Promise<void> {
  const res = await fetch("/api/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceToken: input.deviceToken,
      partySize: input.partySize,
      guestNames: input.guestNames,
      treatmentSelections: input.treatmentSelections,
      personalizations: input.personalizations,
      therapists: input.therapists,
    }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error ?? `Could not save the intake (${res.status}).`);
  }
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

// Turns a QR self-check-in ("incomplete") into a normal visit: reception
// supplies the pieces the guest's phone couldn't — name, therapist, treatment
// — and the row flips to "submitted" so it renders exactly like a kiosk
// handoff from then on. Direct client write (not a serverless endpoint): RLS's
// intakes_update_auth (has_location_access + can_view_all_intakes, migration
// 0017) already permits any owner/manager/front-desk to update the row.
export async function completeIntake(
  id: string,
  fields: {
    guestNames: string[];
    treatmentSelections: TreatmentSnapshot[];
    therapists: (TherapistAssignment | null)[];
  },
): Promise<void> {
  const { error } = await supabase
    .from("intakes")
    .update({
      guest_names: fields.guestNames,
      treatment_selections: fields.treatmentSelections,
      therapists: fields.therapists,
      status: "submitted",
    })
    .eq("id", id);
  if (error) throw error;
}
