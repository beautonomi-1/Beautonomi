/**
 * useLocation – get user's current GPS coordinates.
 * Requests foreground permission and returns coordinates.
 */
import { useState, useEffect } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";

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
  const [coords, setCoords] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function getLocation() {
    if (Platform.OS === "web") {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
      }
      if (status !== "granted") {
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
  }

  useEffect(() => {
    getLocation();
  }, []);

  return { coords, loading, error, refresh: getLocation };
}
