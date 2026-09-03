import { useCallback, useRef, useState } from "react";
import * as Location from "expo-location";
import { mapGeocodeFeatureToAddressParts } from "@beautonomi/utils";
import { reverseGeocode } from "@/hooks/useAddresses";
import { ensureForegroundLocationPermission, PERMISSION_COPY } from "@/lib/native-permissions";

export type AtHomePrefillState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "error"; message: string }
  | { status: "success" };

export type AtHomePrefillAddress = {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  country: string;
  postal_code?: string;
};

export type AtHomePrefillResult = {
  address: AtHomePrefillAddress;
  latitude: number;
  longitude: number;
};

/**
 * Geolocation + Mapbox reverse-geocode for at-home booking address prefill.
 */
export function useAtHomeAddressPrefill(options?: { defaultCountry?: string }) {
  const [state, setState] = useState<AtHomePrefillState>({ status: "idle" });
  const ranAutoRef = useRef(false);
  const defaultCountry = options?.defaultCountry ?? "ZA";

  const prefillFromCurrentLocation = useCallback(async (): Promise<AtHomePrefillResult | null> => {
    setState({ status: "locating" });

    try {
      const allowed = await ensureForegroundLocationPermission(PERMISSION_COPY.locationNearby);
      if (!allowed) {
        setState({
          status: "error",
          message: "Location permission denied. Enable it in settings or enter your address manually.",
        });
        return null;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;

      const { feature, error } = await reverseGeocode(latitude, longitude);
      if (error) {
        setState({ status: "error", message: error });
        return { latitude, longitude, address: { line1: "", city: "", country: defaultCountry } };
      }

      if (feature) {
        const mapped = mapGeocodeFeatureToAddressParts(feature, {
          defaultCountryName: defaultCountry,
        });
        const parts = (feature.place_name || "").split(",").map((p) => p.trim()).filter(Boolean);
        const result: AtHomePrefillResult = {
          latitude,
          longitude,
          address: {
            line1: mapped.address_line1 || parts[0] || feature.text || "",
            line2: "",
            city: mapped.city || parts[1] || "",
            state: mapped.state,
            country: mapped.country || defaultCountry,
            postal_code: mapped.postal_code,
          },
        };
        setState({ status: "success" });
        return result;
      }

      setState({
        status: "error",
        message: "Could not resolve street address. Enter it manually or retry.",
      });
      return {
        latitude,
        longitude,
        address: { line1: "", city: "", country: defaultCountry },
      };
    } catch {
      setState({
        status: "error",
        message: "Unable to get your location. Try again or enter your address manually.",
      });
      return null;
    }
  }, [defaultCountry]);

  const tryAutoPrefill = useCallback(
    async (
      isAtHome: boolean,
      current: { line1: string; city: string },
    ): Promise<AtHomePrefillResult | null> => {
      if (!isAtHome || ranAutoRef.current) return null;
      if (current.line1.trim() || current.city.trim()) return null;
      ranAutoRef.current = true;
      return prefillFromCurrentLocation();
    },
    [prefillFromCurrentLocation],
  );

  const resetAutoPrefill = useCallback(() => {
    ranAutoRef.current = false;
    setState({ status: "idle" });
  }, []);

  return {
    state,
    prefillFromCurrentLocation,
    tryAutoPrefill,
    resetAutoPrefill,
  };
}
