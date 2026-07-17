import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  clearDeviceToken,
  getDeviceToken,
  heartbeatDevice,
  pairDevice,
  validateDevice,
} from "../lib/device";

// Device pairing gate. On boot, the kiosk reads its stored token and validates
// it to resolve the location it's paired to — replacing the ?location= bridge.
// While paired it heartbeats periodically so the manager dashboard shows the
// device as live. A wiped/revoked token drops back to "unpaired" (activation
// screen). Provider sits above CatalogProvider on the "/" route.

type DeviceStatus = "checking" | "paired" | "unpaired";

const HEARTBEAT_MS = 5 * 60 * 1000;

interface DeviceContextValue {
  status: DeviceStatus;
  // Resolved location for a paired device; null while checking/unpaired.
  locationId: string | null;
  // The device's own token, or null when unpaired (e.g. the bundled demo). It
  // authenticates every kiosk write — the server derives the location from it,
  // so the write paths take this rather than a location id. Null therefore
  // means "cannot write", which is exactly what the demo should be.
  token: string | null;
  // Pair with a 6-digit code (throws on failure); on success flips to paired.
  pair: (code: string) => Promise<void>;
  // Forget the token and return to the activation screen.
  unpair: () => void;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DeviceStatus>("checking");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Validate any stored token once on mount.
  useEffect(() => {
    let cancelled = false;
    const stored = getDeviceToken();
    if (!stored) {
      setStatus("unpaired");
      return;
    }
    validateDevice(stored)
      .then((res) => {
        if (cancelled) return;
        if (res) {
          setLocationId(res.locationId);
          setToken(stored);
          setStatus("paired");
        } else {
          clearDeviceToken();
          setStatus("unpaired");
        }
      })
      .catch(() => {
        // Network error: don't wipe the token (could be transient) — but there's
        // no location to run on, so show the activation screen.
        if (!cancelled) setStatus("unpaired");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Heartbeat while paired.
  useEffect(() => {
    if (status !== "paired") return;
    const tick = () => {
      const token = getDeviceToken();
      if (token) void heartbeatDevice(token);
    };
    const id = setInterval(tick, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [status]);

  const pair = useCallback(async (code: string) => {
    const { locationId: loc } = await pairDevice(code);
    // pairDevice has just persisted the token; read it back so context and
    // storage can't disagree about which token this device holds.
    setToken(getDeviceToken());
    setLocationId(loc);
    setStatus("paired");
  }, []);

  const unpair = useCallback(() => {
    clearDeviceToken();
    setToken(null);
    setLocationId(null);
    setStatus("unpaired");
  }, []);

  return (
    <DeviceContext.Provider value={{ status, locationId, token, pair, unpair }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice(): DeviceContextValue {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error("useDevice must be used within a DeviceProvider");
  return ctx;
}
