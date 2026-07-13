export type AppStep =
  | "welcome"
  | "staffHandoff"
  | "bodyMap"
  | "preferences"
  | "guestHandoff"
  | "handoff"
  | "masseur";

export type BodyView = "front" | "back";

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

export interface GuestState {
  step: AppStep;
  guestName: string;
  treatmentId: string | null;
  treatmentMinutes: number | null;
  partySize: PartySize;
  // Index into `guests` for whichever person is currently personalizing.
  activeGuestIndex: number;
  guests: PersonalizationState[];
}

export type GuestAction =
  | { type: "SET_STEP"; step: AppStep }
  | { type: "SET_NAME"; name: string }
  | { type: "SET_TREATMENT"; treatmentId: string }
  | { type: "SET_TREATMENT_MINUTES"; minutes: number }
  | { type: "SET_PARTY_SIZE"; partySize: PartySize }
  | { type: "SET_BODY_GENDER"; bodyGender: BodyGender }
  | { type: "SET_ZONE_MARK"; zoneId: ZoneId; mark: ZoneMark }
  | { type: "SET_ZONE_NOTE"; zoneId: ZoneId; note: string }
  | { type: "SET_GENERAL_NOTE"; note: string }
  | { type: "SET_PREFERENCE"; key: keyof Preferences; value: Preferences[keyof Preferences] }
  // Guest finished the body map + preferences steps. Routes to the next
  // guest's handoff screen, or to the final handoff if everyone is done.
  | { type: "COMPLETE_GUEST_PREFERENCES" }
  | { type: "RESET_SESSION" };
