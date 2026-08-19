/**
 * useLocation – get user's current GPS coordinates.
 * Requests foreground permission and returns coordinates.
 */
import { useCallback, useState, useEffect } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";
import { ensureForegroundLocationPermission, PERMISSION_COPY } from "@/lib/native-permissions";
import { useNativePermissionsOnboardingGate } from "@/providers/NativePermissionsOnboardingProvider";

interface LocationData {
  latitude: number;
  longitude: number;
}

interface UseLocationResult {
  coords: LocationData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useLocation(): UseLocationResult {
  const { gate } = useNativePermissionsOnboardingGate();
  const [coords, setCoords] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getLocation = useCallback(async () => {
    if (Platform.OS === "web") {
      setLoading(false);
      return;
    }
    if (gate.phase !== "complete") {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
        const allowed = await ensureForegroundLocationPermission(PERMISSION_COPY.locationNearby);
      if (!allowed) {
        setError("Location permission denied");
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setCoords({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get location");
    } finally {
      setLoading(false);
    }
  }, [gate.phase]);

  useEffect(() => {
    getLocation();
  }, [getLocation]);

  return { coords, loading, error, refresh: getLocation };
}
