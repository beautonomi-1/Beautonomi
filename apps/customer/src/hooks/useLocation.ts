/**
 * Hook for user location – used for "Nearest" providers on Home.
 */
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";

export interface Coords {
  latitude: number;
  longitude: number;
}

export function useLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (Platform.OS === "web") {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        let { status } = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== "granted") {
          const req = await Location.requestForegroundPermissionsAsync();
          status = req.status;
        }
        if (cancelled) return;
        if (status !== "granted") {
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
  }, []);

  return { coords, error, loading };
}
