import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { GuestAction, GuestState, PersonalizationState } from "../types";
import { massageTypes, durationPrice } from "../data/massageTypes";

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
  guestName: "",
  treatmentId: null,
  treatmentMinutes: null,
  partySize: 1,
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
    case "SET_NAME":
      return { ...state, guestName: action.name };
    case "SET_TREATMENT":
      return { ...state, treatmentId: action.treatmentId, treatmentMinutes: null };
    case "SET_TREATMENT_MINUTES":
      return { ...state, treatmentMinutes: action.minutes };
    case "SET_PARTY_SIZE": {
      const guests =
        action.partySize === 2
          ? state.guests.length === 2
            ? state.guests
            : [...state.guests, createPersonalization()]
          : [state.guests[0]];

      // The currently selected treatment/duration may not be offered for the
      // new party size (e.g. "Balijski z Masłem Shea" has no couple price) —
      // clear whichever part is no longer valid rather than leaving a
      // silently invalid selection.
      const treatment = massageTypes.find((m) => m.id === state.treatmentId);
      const treatmentStillOffered = treatment?.durations.some(
        (d) => durationPrice(d, action.partySize) !== undefined,
      );
      const selectedDuration = treatment?.durations.find(
        (d) => d.minutes === state.treatmentMinutes,
      );
      const minutesStillValid =
        selectedDuration && durationPrice(selectedDuration, action.partySize) !== undefined;

      return {
        ...state,
        partySize: action.partySize,
        guests,
        activeGuestIndex: 0,
        treatmentId: treatmentStillOffered ? state.treatmentId : null,
        treatmentMinutes: treatmentStillOffered && minutesStillValid ? state.treatmentMinutes : null,
      };
    }
    case "SET_BODY_GENDER":
      return updateActiveGuest(state, (g) => ({ ...g, bodyGender: action.bodyGender }));
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
      return initialState;
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
