import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// DB row shapes (public.rooms / public.beds from 0022_rooms_beds).
// Admin CRUD for /manage — direct client calls, RLS-gated by
// can_manage_location() (rooms_write / beds_write). Unlike the kiosk's
// kiosk_rooms() RPC, these reads include inactive rows so a manager can
// re-enable something they hid earlier.
// ---------------------------------------------------------------------------

export interface BedRow {
  id: string;
  room_id: string;
  name: string;
  active: boolean;
  sort: number;
}

export interface RoomRow {
  id: string;
  location_id: string;
  name: string;
  active: boolean;
  sort: number;
}

export interface RoomWithBeds extends RoomRow {
  beds: BedRow[];
}

export async function fetchRoomsAdmin(locationId: string): Promise<RoomWithBeds[]> {
  const { data, error } = await supabase
    .from("rooms")
    .select("id, location_id, name, active, sort, beds(id, room_id, name, active, sort)")
    .eq("location_id", locationId)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as (RoomRow & { beds: BedRow[] })[]).map((r) => ({
    ...r,
    beds: [...r.beds].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
  }));
}

export async function createRoom(locationId: string, name: string, sort: number): Promise<void> {
  const { error } = await supabase.from("rooms").insert({ location_id: locationId, name, sort });
  if (error) throw error;
}

export async function updateRoom(
  id: string,
  patch: Partial<Pick<RoomRow, "name" | "active">>,
): Promise<void> {
  const { data, error } = await supabase.from("rooms").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Room update matched no row (RLS or a stale id).");
}

// Hard delete — intakes keep a name snapshot (room_assignments), so a deleted
// room doesn't erase history; beds cascade via the FK.
//
// RLS on a DELETE just filters rows out of the affected set — a row a policy
// blocks isn't an error, it's simply not deleted, and Postgrest reports the
// same success either way. Without checking that a row actually came back,
// a blocked delete looks identical to a real one: no error, nothing removed,
// silent no-op. Requesting `.select("id")` and checking the result is what
// turns that into a real, surfaced error.
export async function deleteRoom(id: string): Promise<void> {
  const { data, error } = await supabase.from("rooms").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Room delete matched no row (RLS or a stale id).");
}

export async function createBed(roomId: string, name: string, sort: number): Promise<void> {
  const { error } = await supabase.from("beds").insert({ room_id: roomId, name, sort });
  if (error) throw error;
}

export async function updateBed(
  id: string,
  patch: Partial<Pick<BedRow, "name" | "active">>,
): Promise<void> {
  const { data, error } = await supabase.from("beds").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Bed update matched no row (RLS or a stale id).");
}

// See deleteRoom's comment: without .select() + a length check, an
// RLS-blocked delete silently "succeeds" with nothing actually removed.
export async function deleteBed(id: string): Promise<void> {
  const { data, error } = await supabase.from("beds").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Bed delete matched no row (RLS or a stale id).");
}
