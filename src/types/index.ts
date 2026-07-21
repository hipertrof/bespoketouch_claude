export type AppStep =
  | "welcome"
  | "treatment"
  | "staffHandoff"
  | "bodyMap"
  | "preferences"
  | "guestHandoff"
  | "handoff"
  | "masseur";

export type BodyView = "front" | "back";

// UI languages. Defined here (not in i18n/translations) so GuestState can
// reference it without a circular import; translations.ts re-exports it.
export type LangCode = "pl" | "en" | "uk" | "it" | "fr" | "de" | "es" | "id";

export type BodyGender = "male" | "female";

export type ZoneMark = "standard" | "priority" | "blocked";

export type ZoneId =
  // Przód
  | "scalp"
  | "face"
  | "decolletage"
  | "chest"
  | "abdomen"
  | "upperArmsFront"
  | "forearmsFront"
  | "hands"
  | "thighsFront"
  | "shins"
  | "feetTop"
  // Tył
  | "nape"
  | "shoulders"
  | "upperBack"
  | "lowerBack"
  | "upperArmsBack"
  | "forearmsBack"
  | "glutes"
  | "thighsBack"
  | "calves"
  | "feetSole";

export type PressureLevel = "Lekki" | "Średni" | "Mocny" | "Głęboki";

export type CommunicationStyle = "silent" | "guided";

export type MusicPreference = "nature" | "ambient" | "silence";

// 1 = single-person treatment, 2 = couple's treatment (two guests personalize
// one after another on the same tablet).
export type PartySize = 1 | 2;

export interface MassageDuration {
  minutes: number;
  // PLN. Either may be absent — not every duration is offered for both party
  // sizes (e.g. Lomi Lomi single skips 90 min, but couples get it).
  priceSingle?: number;
  priceCouple?: number;
}

export interface MassageType {
  id: string;
  name: string;
  description: string;
  durations: MassageDuration[];
}

export interface OilOption {
  id: string;
  name: string;
  subtitle: string;
  description: string;
}

export interface ZoneDefinition {
  id: ZoneId;
  label: string;
  view: BodyView;
}

export interface Preferences {
  pressure: PressureLevel;
  oilId: string;
  tableWarming: boolean;
  headrestPillow: "Standardowa" | "Ultra-miękka";
  music: MusicPreference;
  communication: CommunicationStyle;
}

// Everything one guest personalizes themselves. Couples get one of these per
// person, filled in one after another on the same tablet.
export interface PersonalizationState {
  bodyGender: BodyGender;
  zones: Partial<Record<ZoneId, ZoneMark>>;
  zoneNotes: Partial<Record<ZoneId, string>>;
  generalNote: string;
  preferences: Preferences;
}

export interface TreatmentSelection {
  treatmentId: string | null;
  treatmentMinutes: number | null;
}

// Therapist the receptionist assigned to one guest (name snapshot only — the
// queue renders it without another lookup). Null = not assigned.
export interface TherapistAssignment {
  id: string;
  name: string;
}

// Opt-in guest CRM (preference memory) state for one guest. The phone is held
// in memory only — never persisted client-side; the server stores just an
// HMAC of it. `consent` defaults false and is always required before a save
// (a prefill alone never writes). `prefilled` = a lookup hit was applied.
export interface GuestCrmState {
  phone: string;
  consent: boolean;
  prefilled: boolean;
}

export interface GuestState {
  step: AppStep;
  // Index-aligned with `guests` — guestNames[i] is the name of guests[i].
  guestNames: string[];
  // Index-aligned with `guests`. When !separateTreatments, both entries are
  // kept mirrored to the same value by the reducer.
  treatmentSelections: TreatmentSelection[];
  // Index-aligned with `guests` — the therapist the receptionist assigned to
  // each person (null = none picked).
  guestTherapists: (TherapistAssignment | null)[];
  // Only meaningful when partySize === 2.
  separateTreatments: boolean;
  partySize: PartySize;
  // Global UI language, set from the header selector. Default "pl".
  language: LangCode;
  // Index into `guests` for whichever person is currently personalizing.
  activeGuestIndex: number;
  guests: PersonalizationState[];
  // Index-aligned with `guests` — returning-guest CRM state per person. Only
  // used when the kiosk is paired to a real location (see CatalogContext).
  guestCrm: GuestCrmState[];
  // The offer the kiosk is running against, loaded from the DB (or the bundled
  // fallback) by CatalogContext. Held here — language-agnostic, names unused —
  // only so the reducer can validate selections against the live offer.
  catalog: MassageType[];
}

export type GuestAction =
  | { type: "SET_STEP"; step: AppStep }
  | { type: "SET_GUEST_NAME"; index: number; name: string }
  | { type: "SET_TREATMENT"; index: number; treatmentId: string }
  | { type: "SET_TREATMENT_MINUTES"; index: number; minutes: number }
  | { type: "SET_GUEST_THERAPIST"; index: number; therapist: TherapistAssignment | null }
  | { type: "SET_GUEST_PHONE"; index: number; phone: string }
  | { type: "SET_GUEST_CONSENT"; index: number; consent: boolean }
  // A returning-guest lookup hit: merge the stored preferences + zone marks
  // into guests[index] and flag it prefilled.
  | {
      type: "APPLY_GUEST_PROFILE";
      index: number;
      preferences: Partial<Preferences>;
      zones: Partial<Record<ZoneId, ZoneMark>>;
    }
  // Reset one guest to defaults (used after a right-to-erasure "forget").
  | { type: "CLEAR_GUEST_PROFILE"; index: number }
  | { type: "SET_SEPARATE_TREATMENTS"; separate: boolean }
  | { type: "SET_PARTY_SIZE"; partySize: PartySize }
  | { type: "SET_LANGUAGE"; language: LangCode }
  | { type: "SET_BODY_GENDER"; bodyGender: BodyGender }
  | { type: "SET_GUEST_GENDER"; index: number; bodyGender: BodyGender }
  | { type: "SET_ZONE_MARK"; zoneId: ZoneId; mark: ZoneMark }
  | { type: "SET_ZONE_NOTE"; zoneId: ZoneId; note: string }
  | { type: "SET_GENERAL_NOTE"; note: string }
  | { type: "SET_PREFERENCE"; key: keyof Preferences; value: Preferences[keyof Preferences] }
  // Guest finished the body map + preferences steps. Routes to the next
  // guest's handoff screen, or to the final handoff if everyone is done.
  | { type: "COMPLETE_GUEST_PREFERENCES" }
  // Offer (re)loaded by CatalogContext. Re-validates existing selections
  // against the new offer so a stale pick can't survive an offer swap.
  | { type: "SET_CATALOG"; catalog: MassageType[] }
  | { type: "RESET_SESSION" };
