import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { t } from "../../i18n/translations";
import {
  createBed,
  createRoom,
  deleteBed,
  deleteRoom,
  fetchRoomsAdmin,
  updateBed,
  updateRoom,
  type RoomWithBeds,
} from "../../lib/rooms";
import { Button } from "../Button";

// Rooms + beds editor for /manage, mounted alongside the services section.
// Beds belong to rooms (pick a room on the kiosk, then a bed within it) — see
// migration 0022. Assignment is optional on the kiosk: a location with an
// empty list here simply shows no room picker to reception.
export function RoomsEditor({ locationId }: { locationId: string }) {
  const { lang } = useLanguage();
  const [rooms, setRooms] = useState<RoomWithBeds[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRooms(await fetchRoomsAdmin(locationId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function addRoom() {
    setBusy(true);
    setError(null);
    try {
      await createRoom(locationId, t("cmsRoomName", lang), rooms.length);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <div>
      {error && <p className="mb-4 text-sm text-rose-dark">{error}</p>}

      {rooms.length === 0 ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-soft">
          <p className="mb-4 text-slate">{t("cmsNoRooms", lang)}</p>
          <Button onClick={addRoom} disabled={busy}>
            {t("cmsAddRoom", lang)}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} onChanged={load} />
          ))}
          <Button variant="secondary" onClick={addRoom} disabled={busy} className="self-start">
            + {t("cmsAddRoom", lang)}
          </Button>
        </div>
      )}
    </div>
  );
}

function RoomCard({ room, onChanged }: { room: RoomWithBeds; onChanged: () => void }) {
  const { lang } = useLanguage();
  const [name, setName] = useState(room.name);
  const [active, setActive] = useState(room.active);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await updateRoom(room.id, { name: trimmed, active });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await deleteRoom(room.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function addBed() {
    setBusy(true);
    setError(null);
    try {
      await createBed(room.id, t("cmsBedName", lang), room.beds.length);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-2xl bg-white p-5 shadow-soft ${active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-11 flex-1 rounded-xl border border-sand bg-cream px-3 text-charcoal outline-none focus:border-sage"
        />
        <label className="flex items-center gap-2 text-sm text-slate">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t("cmsActive", lang)}
        </label>
        <Button variant="secondary" onClick={save} disabled={busy}>
          {busy ? t("saving", lang) : t("save", lang)}
        </Button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="text-sm text-rose-dark hover:underline"
        >
          {confirmDelete ? t("cmsDeleteRoomConfirm", lang) : t("cmsDeleteRoom", lang)}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-rose-dark">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand pt-4">
        {room.beds.map((bed) => (
          <BedChip key={bed.id} bed={bed} onChanged={onChanged} onError={setError} />
        ))}
        <button
          type="button"
          onClick={addBed}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-sand px-3 py-1.5 text-xs font-medium text-sage-dark hover:border-sage"
        >
          <Plus size={13} />
          {t("cmsAddBed", lang)}
        </button>
      </div>
    </div>
  );
}

function BedChip({
  bed,
  onChanged,
  onError,
}: {
  bed: RoomWithBeds["beds"][number];
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const { lang } = useLanguage();
  const [name, setName] = useState(bed.name);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === bed.name) {
      setEditing(false);
      setName(bed.name);
      return;
    }
    setBusy(true);
    try {
      await updateBed(bed.id, { name: trimmed });
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setEditing(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteBed(bed.id);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={name}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && save()}
        className="min-h-9 w-32 rounded-full border border-sand bg-cream px-3 text-sm text-charcoal outline-none focus:border-sage"
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-oatmeal px-3 py-1.5 text-sm text-charcoal">
      <button type="button" onClick={() => setEditing(true)} className="hover:underline">
        {bed.name}
      </button>
      <button
        type="button"
        onClick={remove}
        aria-label={t("cmsDeleteBed", lang)}
        disabled={busy}
        className="text-slate-light transition-colors hover:text-rose-dark"
      >
        <Trash2 size={12} />
      </button>
    </span>
  );
}
