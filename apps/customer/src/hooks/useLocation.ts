/**
 * Hook for user location – used for "Nearest" providers on Home.
 */
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";
import { ensureForegroundLocationPermission } from "@/lib/native-permissions";
import { useNativePermissionsOnboardingGate } from "@/providers/NativePermissionsOnboardingProvider";

export interface Coords {
  latitude: number;
  longitude: number;
}

export function useLocation() {
  const { gate } = useNativePermissionsOnboardingGate();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const getLocation = useCallback(() => {
    if (Platform.OS === "web") {
      setLoading(false);
      return;
    }
    if (gate.phase !== "complete") {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const allowed = await ensureForegroundLocationPermission({
          title: "Location permission",
          message: "Allow location access to show nearby professionals and travel times.",
        });
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

  useEffect(() => getLocation(), [getLocation]);

  return { coords, error, loading };
}
