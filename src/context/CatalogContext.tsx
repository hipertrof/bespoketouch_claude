import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { bundledCatalog, fetchCatalog, type CatalogService } from "../lib/catalog";

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
  const locationId = searchParams.get("location");

  const [catalog, setCatalog] = useState<CatalogService[]>(() => bundledCatalog());
  const [source, setSource] = useState<CatalogSource>("bundled");
  const [loading, setLoading] = useState<boolean>(Boolean(locationId));

  useEffect(() => {
    // No location paired → run on the bundled catalogue (local dev / demo).
    if (!locationId) {
      setCatalog(bundledCatalog());
      setSource("bundled");
      setLoading(false);
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

    return () => {
      cancelled = true;
    };
  }, [locationId]);

  return (
    <CatalogContext.Provider value={{ catalog, loading, source, locationId }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within a CatalogProvider");
  return ctx;
}
