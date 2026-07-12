import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { GuestAction, GuestState } from "../types";

const initialState: GuestState = {
  step: "welcome",
  guestName: "",
  treatmentId: null,
  bodyGender: "female",
  zones: {},
  zoneNotes: {},
  preferences: {
    pressure: "Średni",
    oilId: "lawenda-rumianek",
    tableWarming: true,
    headrestPillow: "Standardowa",
    music: "nature",
    communication: "silent",
  },
};

function guestReducer(state: GuestState, action: GuestAction): GuestState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_NAME":
      return { ...state, guestName: action.name };
    case "SET_TREATMENT":
      return { ...state, treatmentId: action.treatmentId };
    case "SET_BODY_GENDER":
      return { ...state, bodyGender: action.bodyGender };
    case "SET_ZONE_MARK":
      return {
        ...state,
        zones: { ...state.zones, [action.zoneId]: action.mark },
      };
    case "SET_ZONE_NOTE":
      return {
        ...state,
        zoneNotes: { ...state.zoneNotes, [action.zoneId]: action.note },
      };
    case "SET_PREFERENCE":
      return {
        ...state,
        preferences: { ...state.preferences, [action.key]: action.value },
      };
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
