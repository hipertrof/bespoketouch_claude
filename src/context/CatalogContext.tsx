import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useDevice } from "./DeviceContext";
import { bundledCatalog, fetchCatalog, type CatalogService } from "../lib/catalog";
import {
  fetchLocationInfo,
  fetchTherapists,
  type LocationInfo,
  type TherapistOption,
} from "../lib/kiosk";

// Where the kiosk's offer came from. "db" = live catalogue for a paired
// location; "bundled" = the built-in Nusa catalogue (no ?location= param, or
// the DB fetch failed / returned nothing — keeps local dev and demos working).
type CatalogSource = "db" | "bundled";

interface CatalogContextValue {
  catalog: CatalogService[];
  loading: boolean;
  source: CatalogSource;
  // The resolved location id (from ?location=), or null when running bundled.
  locationId: string | null;
  // Account + location display names (welcome headline). Null when bundled or
  // the lookup failed — the headline is simply omitted then.
  locationInfo: LocationInfo | null;
  // Therapists assigned to the location, for the receptionist's per-guest
  // assignment dropdown. Empty when bundled / none assigned.
  therapists: TherapistOption[];
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

// Loads the kiosk's offer. Location is resolved from the ?location=<id> query
// param — a temporary Phase-3b bridge; Phase 2 replaces it with the paired
// device token. Reads happen as the anon role via the RLS bridge (only active
// services of active locations are visible). Always yields a usable catalogue:
// the bundled offer is the initial value and the fallback on any failure, so
// the kiosk UI never has to handle an empty/loading offer specially.
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  // Location resolves from the paired device token (the normal path); a
  // `?location=` query param still overrides it as a dev/legacy escape hatch
  // (the live tablet ran on it before pairing existed). No token + no param =
  // bundled demo.
  const { locationId: deviceLocationId } = useDevice();
  const locationId = searchParams.get("location") ?? deviceLocationId;

  const [catalog, setCatalog] = useState<CatalogService[]>(() => bundledCatalog());
  const [source, setSource] = useState<CatalogSource>("bundled");
  const [loading, setLoading] = useState<boolean>(Boolean(locationId));
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [therapists, setTherapists] = useState<TherapistOption[]>([]);

  useEffect(() => {
    // No location paired → run on the bundled catalogue (local dev / demo).
    if (!locationId) {
      setCatalog(bundledCatalog());
      setSource("bundled");
      setLoading(false);
      setLocationInfo(null);
      setTherapists([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
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

    return () => {
      cancelled = true;
    };
  }, [locationId]);

  return (
    <CatalogContext.Provider
      value={{ catalog, loading, source, locationId, locationInfo, therapists }}
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
