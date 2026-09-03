"use client";

import { useCallback, useRef, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { mapGeocodeFeatureToAddressParts, type MapboxGeocodeFeatureLike } from "@beautonomi/utils";
import { HOUSE_CALL_CONFIG } from "@/lib/config/house-call-config";
import type { AtHomeAddress } from "@/app/book/types/booking-engine";

export type AtHomePrefillState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "error"; message: string }
  | { status: "success" };

export type AtHomePrefillResult = {
  address: Partial<AtHomeAddress>;
  latitude: number;
  longitude: number;
};

/**
 * Geolocation + Mapbox reverse-geocode for at-home booking address prefill.
 */
export function useAtHomeAddressPrefill(options?: { defaultCountryCode?: string }) {
  const [state, setState] = useState<AtHomePrefillState>({ status: "idle" });
  const ranAutoRef = useRef(false);

  const prefillFromCurrentLocation = useCallback(async (): Promise<AtHomePrefillResult | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "error", message: "Geolocation is not supported on this device." });
      return null;
    }

    setState({ status: "locating" });

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            // Mapbox geocoding v5 feature (features[0]) or null when nothing matched.
            const reverse = await fetcher.post<{ data: MapboxGeocodeFeatureLike | null }>(
              "/api/mapbox/reverse-geocode",
              { longitude, latitude },
            );

            if (reverse.data && Array.isArray(reverse.data.center)) {
              const parsed = mapGeocodeFeatureToAddressParts(reverse.data, {
                defaultCountryName:
                  options?.defaultCountryCode === "ZA"
                    ? HOUSE_CALL_CONFIG.DEFAULT_COUNTRY_NAME
                    : undefined,
              });
              const result: AtHomePrefillResult = {
                latitude,
                longitude,
                address: {
                  line1: parsed.address_line1 || String(reverse.data.place_name ?? ""),
                  line2: "",
                  city: parsed.city ?? "",
                  state: parsed.state ?? "",
                  country: parsed.country || options?.defaultCountryCode || "ZA",
                  postal_code: parsed.postal_code ?? "",
                  latitude,
                  longitude,
                },
              };
              setState({ status: "success" });
              resolve(result);
              return;
            }

            const fallback: AtHomePrefillResult = {
              latitude,
              longitude,
              address: {
                line1: "",
                city: "",
                country: options?.defaultCountryCode || "ZA",
                latitude,
                longitude,
              },
            };
            setState({
              status: "error",
              message: "Could not resolve street address. Enter it manually or retry.",
            });
            resolve(fallback);
          } catch {
            setState({
              status: "error",
              message: "Unable to resolve your address from current location.",
            });
            resolve(null);
          }
        },
        (err) => {
          const message =
            err.code === err.PERMISSION_DENIED
              ? "Location permission denied. Enable it in browser settings or enter your address manually."
              : "Unable to get your location. Try again or enter your address manually.";
          setState({ status: "error", message });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
    });
  }, [options?.defaultCountryCode]);

  /** Auto-prefill once when at-home is selected and address fields are empty. */
  const tryAutoPrefill = useCallback(
    async (isAtHome: boolean, current: AtHomeAddress): Promise<AtHomePrefillResult | null> => {
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
