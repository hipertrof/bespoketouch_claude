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
  const { error } = await supabase.from("rooms").update(patch).eq("id", id);
  if (error) throw error;
}

// Hard delete — intakes keep a name snapshot (room_assignments), so a deleted
// room doesn't erase history; beds cascade via the FK.
export async function deleteRoom(id: string): Promise<void> {
  const { error } = await supabase.from("rooms").delete().eq("id", id);
  if (error) throw error;
}

export async function createBed(roomId: string, name: string, sort: number): Promise<void> {
  const { error } = await supabase.from("beds").insert({ room_id: roomId, name, sort });
  if (error) throw error;
}

export async function updateBed(
  id: string,
  patch: Partial<Pick<BedRow, "name" | "active">>,
): Promise<void> {
  const { error } = await supabase.from("beds").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteBed(id: string): Promise<void> {
  const { error } = await supabase.from("beds").delete().eq("id", id);
  if (error) throw error;
}
