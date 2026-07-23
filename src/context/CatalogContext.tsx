import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useDevice } from "./DeviceContext";
import { bundledCatalog, fetchCatalog, type CatalogService } from "../lib/catalog";
import {
  fetchLocationInfo,
  fetchRooms,
  fetchTherapists,
  type LocationInfo,
  type RoomOption,
  type TherapistOption,
} from "../lib/kiosk";
import { fetchBranding, type LocationBranding } from "../lib/branding";

// Where the kiosk's offer came from. "db" = live catalogue for a paired
// location; "bundled" = the built-in Nusa catalogue (unpaired ?demo run, or the
// DB fetch failed / returned nothing — keeps local dev and demos working).
type CatalogSource = "db" | "bundled";

interface CatalogContextValue {
  catalog: CatalogService[];
  loading: boolean;
  source: CatalogSource;
  // The location this kiosk is paired to, or null when running bundled (?demo).
  locationId: string | null;
  // Account + location display names (welcome headline). Null when bundled or
  // the lookup failed — the headline is simply omitted then.
  locationInfo: LocationInfo | null;
  // Therapists assigned to the location, for the receptionist's per-guest
  // assignment dropdown. Empty when bundled / none assigned.
  therapists: TherapistOption[];
  // Rooms (with beds nested) configured for the location, for the
  // receptionist's per-guest room/bed assignment dropdown. Empty when bundled
  // / none configured — the picker simply doesn't render.
  rooms: RoomOption[];
  // Per-location kiosk branding (logo + accent colors). Null = stock look
  // (bundled/?demo run, nothing configured, or the lookup failed).
  branding: LocationBranding | null;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

// Loads the kiosk's offer. Location comes from the paired device token and
// nothing else — Phase 2 hardening retired the `?location=<id>` query-param
// bridge, so a tablet can no longer be pointed at an arbitrary spa by editing
// its URL. (`?demo` still runs the bundled offer, which writes nowhere.)
//
// Catalogue reads still happen as the anon role via the RLS bridge (only active
// services of active locations are visible) — a public price list, unlike the
// writes. Always yields a usable catalogue: the bundled offer is the initial
// value and the fallback on any failure, so the kiosk UI never has to handle an
// empty/loading offer specially.
export function CatalogProvider({ children }: { children: ReactNode }) {
  const { locationId } = useDevice();

  const [catalog, setCatalog] = useState<CatalogService[]>(() => bundledCatalog());
  const [source, setSource] = useState<CatalogSource>("bundled");
  const [loading, setLoading] = useState<boolean>(Boolean(locationId));
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [therapists, setTherapists] = useState<TherapistOption[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [branding, setBranding] = useState<LocationBranding | null>(null);

  useEffect(() => {
    // Unpaired → run on the bundled catalogue (local dev / ?demo).
    if (!locationId) {
      setCatalog(bundledCatalog());
      setSource("bundled");
      setLoading(false);
      setLocationInfo(null);
      setTherapists([]);
      setRooms([]);
      setBranding(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    // Clear the previous location's headline and therapist roster up front. The
    // extras below are best-effort and only console.warn on failure; without
    // this reset a slow/failed refetch after a re-pair would leave spa A's name
    // and therapist ids live under spa B — letting A's therapists be assigned to
    // B's intakes.
    setLocationInfo(null);
    setTherapists([]);
    setRooms([]);
    setBranding(null);
    fetchCatalog(locationId)
      .then((rows) => {
        if (cancelled) return;
        // Empty offer (unimported location) falls back rather than showing a
        // blank kiosk. toMassageTypes() downstream still filters inactive rows.
        if (rows.length === 0) {
          setCatalog(bundledCatalog());
          setSource("bundled");
        } else {
          setCatalog(rows);
          setSource("db");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[catalog] falling back to bundled offer:", err);
        setCatalog(bundledCatalog());
        setSource("bundled");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Best-effort extras: the headline and the therapist dropdown just don't
    // render if these fail — never block the intake flow on them.
    fetchLocationInfo(locationId)
      .then((info) => {
        if (!cancelled) setLocationInfo(info);
      })
      .catch((err) => console.warn("[kiosk] location info unavailable:", err));
    fetchTherapists(locationId)
      .then((rows) => {
        if (!cancelled) setTherapists(rows);
      })
      .catch((err) => console.warn("[kiosk] therapist list unavailable:", err));
    fetchRooms(locationId)
      .then((rows) => {
        if (!cancelled) setRooms(rows);
      })
      .catch((err) => console.warn("[kiosk] room list unavailable:", err));
    fetchBranding(locationId)
      .then((b) => {
        if (!cancelled) setBranding(b);
      })
      .catch((err) => console.warn("[kiosk] branding unavailable:", err));

    return () => {
      cancelled = true;
    };
  }, [locationId]);

  return (
    <CatalogContext.Provider
      value={{ catalog, loading, source, locationId, locationInfo, therapists, rooms, branding }}
    >
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within a CatalogProvider");
  return ctx;
}
