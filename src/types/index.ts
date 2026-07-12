export type AppStep = "welcome" | "staffHandoff" | "bodyMap" | "preferences" | "handoff" | "masseur";

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

export interface MassageType {
  id: string;
  name: string;
  duration: string;
  description: string;
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

export interface GuestState {
  step: AppStep;
  guestName: string;
  treatmentId: string | null;
  bodyGender: BodyGender;
  zones: Partial<Record<ZoneId, ZoneMark>>;
  zoneNotes: Partial<Record<ZoneId, string>>;
  generalNote: string;
  preferences: Preferences;
}

export type GuestAction =
  | { type: "SET_STEP"; step: AppStep }
  | { type: "SET_NAME"; name: string }
  | { type: "SET_TREATMENT"; treatmentId: string }
  | { type: "SET_BODY_GENDER"; bodyGender: BodyGender }
  | { type: "SET_ZONE_MARK"; zoneId: ZoneId; mark: ZoneMark }
  | { type: "SET_ZONE_NOTE"; zoneId: ZoneId; note: string }
  | { type: "SET_GENERAL_NOTE"; note: string }
  | { type: "SET_PREFERENCE"; key: keyof Preferences; value: Preferences[keyof Preferences] }
  | { type: "RESET_SESSION" };
