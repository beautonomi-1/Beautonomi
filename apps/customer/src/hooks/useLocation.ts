/**
 * Hook for device GPS – fallback when no service address is set.
 * Pass `enabled: false` when SelectedAddress (or route coords) already supplies lat/lng
 * to avoid unnecessary permission prompts.
 */
import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import { ensureForegroundLocationPermission, PERMISSION_COPY } from "@/lib/native-permissions";
import { useNativePermissionsOnboardingGate } from "@/providers/NativePermissionsOnboardingProvider";

export interface Coords {
  latitude: number;
  longitude: number;
}

export type UseLocationOptions = {
  /** When false, skips permission prompts and GPS fetch. Defaults to true. */
  enabled?: boolean;
};

function isLocationGranted(permission: Location.LocationPermissionResponse): boolean {
  return permission.granted === true || permission.status === "granted";
}

export function useLocation(options: UseLocationOptions = {}) {
  const enabled = options.enabled !== false;
  const { gate } = useNativePermissionsOnboardingGate();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  const getLocation = useCallback(() => {
    let cancelled = false;

    (async () => {
      try {
        if (gate.phase !== "complete") {
          const current = await Location.getForegroundPermissionsAsync();
          if (!isLocationGranted(current)) {
            if (!cancelled) {
              setLoading(false);
            }
            return;
          }
        }

        const allowed = await ensureForegroundLocationPermission(PERMISSION_COPY.locationNearby);
        if (cancelled) return;
        if (!allowed) {
          setError("Location permission denied");
          setLoading(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setCoords({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to get location");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gate.phase]);

  useEffect(() => {
    if (!enabled) {
      setCoords(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return getLocation();
  }, [enabled, getLocation]);

  return { coords, error, loading };
}
