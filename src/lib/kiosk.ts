import { supabase } from "./supabase";

// Kiosk-side reads that go through the SECURITY DEFINER RPCs from
// 0009_kiosk_location_therapists.sql (anon role — no table access).

export interface LocationInfo {
  locationName: string;
  accountName: string;
}

export interface TherapistOption {
  id: string;
  name: string;
}

export interface BedOption {
  id: string;
  name: string;
}

export interface RoomOption {
  id: string;
  name: string;
  beds: BedOption[];
}

// Account + location display names for the welcome headline. Null when the
// location doesn't exist or is inactive.
export async function fetchLocationInfo(locationId: string): Promise<LocationInfo | null> {
  const { data, error } = await supabase.rpc("kiosk_location_info", { p_location: locationId });
  if (error) throw error;
  const row = (data as { location_name: string; account_name: string }[] | null)?.[0];
  return row ? { locationName: row.location_name, accountName: row.account_name } : null;
}

// Therapists assigned to the location (names only), for the receptionist's
// per-guest assignment dropdown.
export async function fetchTherapists(locationId: string): Promise<TherapistOption[]> {
  const { data, error } = await supabase.rpc("kiosk_therapists", { p_location: locationId });
  if (error) throw error;
  return ((data as { user_id: string; display_name: string }[] | null) ?? []).map((r) => ({
    id: r.user_id,
    name: r.display_name,
  }));
}

// Rooms (with their beds nested) configured for the location, for the
// receptionist's room/bed assignment dropdowns.
export async function fetchRooms(locationId: string): Promise<RoomOption[]> {
  const { data, error } = await supabase.rpc("kiosk_rooms", { p_location: locationId });
  if (error) throw error;
  return (
    (data as { room_id: string; room_name: string; beds: BedOption[] }[] | null) ?? []
  ).map((r) => ({ id: r.room_id, name: r.room_name, beds: r.beds ?? [] }));
}
