import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { GuestAction, GuestState, PartySize, PersonalizationState, TreatmentSelection } from "../types";
import { massageTypes, durationPrice } from "../data/massageTypes";

// Drops a selection that's no longer offered for the new party size (e.g.
// "Balijski z Masłem Shea" has no couple price) rather than leaving it
// silently invalid.
function validateSelection(sel: TreatmentSelection, partySize: PartySize): TreatmentSelection {
  const treatment = massageTypes.find((m) => m.id === sel.treatmentId);
  const treatmentStillOffered = treatment?.durations.some(
    (d) => durationPrice(d, partySize) !== undefined,
  );
  const selectedDuration = treatment?.durations.find((d) => d.minutes === sel.treatmentMinutes);
  const minutesStillValid =
    selectedDuration && durationPrice(selectedDuration, partySize) !== undefined;

  return {
    treatmentId: treatmentStillOffered ? sel.treatmentId : null,
    treatmentMinutes: treatmentStillOffered && minutesStillValid ? sel.treatmentMinutes : null,
  };
}

const createPersonalization = (): PersonalizationState => ({
  bodyGender: "female",
  zones: {},
  zoneNotes: {},
  generalNote: "",
  preferences: {
    pressure: "Średni",
    oilId: "lawenda-rumianek",
    tableWarming: true,
    headrestPillow: "Standardowa",
    music: "nature",
    communication: "silent",
  },
});

const initialState: GuestState = {
  step: "welcome",
  guestNames: [""],
  treatmentSelections: [{ treatmentId: null, treatmentMinutes: null }],
  separateTreatments: false,
  partySize: 1,
  language: "pl",
  activeGuestIndex: 0,
  guests: [createPersonalization()],
};

function updateActiveGuest(
  state: GuestState,
  update: (guest: PersonalizationState) => PersonalizationState,
): GuestState {
  const guests = state.guests.map((guest, i) =>
    i === state.activeGuestIndex ? update(guest) : guest,
  );
  return { ...state, guests };
}

function guestReducer(state: GuestState, action: GuestAction): GuestState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_LANGUAGE":
      return { ...state, language: action.language };
    case "SET_GUEST_NAME": {
      const guestNames = state.guestNames.map((n, i) => (i === action.index ? action.name : n));
      return { ...state, guestNames };
    }
    case "SET_TREATMENT": {
      // In shared mode, one person's pick applies to everyone; in separate
      // mode, only the targeted index gets the new massage.
      const idIndices = state.separateTreatments
        ? [action.index]
        : state.treatmentSelections.map((_, i) => i);
      const nextTreatmentIds = state.treatmentSelections.map((sel, i) =>
        idIndices.includes(i) ? action.treatmentId : sel.treatmentId,
      );

      // Staff picks duration first, so the massage grid is already filtered
      // down to massages offering it — keep it if every guest's (possibly
      // new) massage still supports it; only clear as a defensive fallback.
      const currentMinutes = state.treatmentSelections[0]?.treatmentMinutes ?? null;
      const minutesStillValid =
        currentMinutes !== null &&
        nextTreatmentIds.every((id) => {
          // No massage chosen yet for this guest — nothing to conflict with.
          if (id === null) return true;
          const treatment = massageTypes.find((m) => m.id === id);
          const duration = treatment?.durations.find((d) => d.minutes === currentMinutes);
          return duration ? durationPrice(duration, state.partySize) !== undefined : false;
        });

      const treatmentSelections = nextTreatmentIds.map((treatmentId) => ({
        treatmentId,
        treatmentMinutes: minutesStillValid ? currentMinutes : null,
      }));
      return { ...state, treatmentSelections };
    }
    case "SET_TREATMENT_MINUTES": {
      // Duration always applies to every guest, even with different
      // massages — couples' treatments must run the same length.
      const treatmentSelections = state.treatmentSelections.map((sel) => ({
        ...sel,
        treatmentMinutes: action.minutes,
      }));
      return { ...state, treatmentSelections };
    }
    case "SET_SEPARATE_TREATMENTS": {
      if (!action.separate) {
        // Collapsing back to shared: make every slot match the first again.
        const shared = state.treatmentSelections[0];
        return {
          ...state,
          separateTreatments: false,
          treatmentSelections: state.treatmentSelections.map(() => shared),
        };
      }
      return { ...state, separateTreatments: true };
    }
    case "SET_PARTY_SIZE": {
      const guests =
        action.partySize === 2
          ? state.guests.length === 2
            ? state.guests
            : [...state.guests, createPersonalization()]
          : [state.guests[0]];
      const guestNames =
        action.partySize === 2
          ? state.guestNames.length === 2
            ? state.guestNames
            : [...state.guestNames, ""]
          : [state.guestNames[0]];

      // Growing to a couple starts the new slot as a copy of the first
      // (shared-mode default); shrinking back to one drops the second and
      // resets separateTreatments, since it's meaningless for a single guest.
      const treatmentSelections =
        action.partySize === 2
          ? state.treatmentSelections.length === 2
            ? state.treatmentSelections.map((sel) => validateSelection(sel, action.partySize))
            : [
                validateSelection(state.treatmentSelections[0], action.partySize),
                validateSelection(state.treatmentSelections[0], action.partySize),
              ]
          : [validateSelection(state.treatmentSelections[0], action.partySize)];

      return {
        ...state,
        partySize: action.partySize,
        guests,
        guestNames,
        treatmentSelections,
        separateTreatments: action.partySize === 1 ? false : state.separateTreatments,
        activeGuestIndex: 0,
      };
    }
    case "SET_BODY_GENDER":
      return updateActiveGuest(state, (g) => ({ ...g, bodyGender: action.bodyGender }));
    case "SET_GUEST_GENDER": {
      const guests = state.guests.map((g, i) =>
        i === action.index ? { ...g, bodyGender: action.bodyGender } : g,
      );
      return { ...state, guests };
    }
    case "SET_ZONE_MARK":
      return updateActiveGuest(state, (g) => ({
        ...g,
        zones: { ...g.zones, [action.zoneId]: action.mark },
      }));
    case "SET_ZONE_NOTE":
      return updateActiveGuest(state, (g) => ({
        ...g,
        zoneNotes: { ...g.zoneNotes, [action.zoneId]: action.note },
      }));
    case "SET_GENERAL_NOTE":
      return updateActiveGuest(state, (g) => ({ ...g, generalNote: action.note }));
    case "SET_PREFERENCE":
      return updateActiveGuest(state, (g) => ({
        ...g,
        preferences: { ...g.preferences, [action.key]: action.value },
      }));
    case "COMPLETE_GUEST_PREFERENCES": {
      if (state.partySize === 2 && state.activeGuestIndex === 0) {
        return { ...state, activeGuestIndex: 1, step: "guestHandoff" };
      }
      return { ...state, step: "handoff" };
    }
    case "RESET_SESSION":
      // Keep the staff's chosen UI language across sessions.
      return { ...initialState, language: state.language };
    default:
      return state;
  }
}

interface GuestContextValue {
  state: GuestState;
  dispatch: React.Dispatch<GuestAction>;
}

const GuestContext = createContext<GuestContextValue | null>(null);

export function GuestProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(guestReducer, initialState);
  return (
    <GuestContext.Provider value={{ state, dispatch }}>
      {children}
    </GuestContext.Provider>
  );
}

export function useGuest(): GuestContextValue {
  const ctx = useContext(GuestContext);
  if (!ctx) throw new Error("useGuest must be used within GuestProvider");
  return ctx;
}

// The person currently completing the body map / preferences steps.
export function useActiveGuest(): PersonalizationState {
  const { state } = useGuest();
  return state.guests[state.activeGuestIndex];
}
