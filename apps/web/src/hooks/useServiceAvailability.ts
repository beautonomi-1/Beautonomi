"use client";

import { useState, useCallback } from "react";
import { fetcher } from "@/lib/http/fetcher";

export interface ServiceAvailability {
  in_zone: boolean;
  zones: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  provider_count?: number;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to check service availability at a location
 */
export function useServiceAvailability() {
  const [availability, setAvailability] = useState<ServiceAvailability>({
    in_zone: false,
    zones: [],
    isLoading: false,
    error: null,
  });

  const checkAvailability = useCallback(
    async (latitude: number, longitude: number, providerId?: string) => {
      setAvailability((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Check zone availability
        const zoneResponse = await fetcher.post<{
          data: {
            in_zone: boolean;
            zones: Array<{ id: string; name: string; type: string }>;
          };
        }>("/api/mapbox/check-zone", {
          point: { latitude, longitude },
          provider_id: providerId,
        });

        // Optionally get provider count (if API supports it)
        let providerCount: number | undefined;
        try {
          const searchResponse = await fetcher.get<{ data: { providers: any[] } }>(
            `/api/public/search?lat=${latitude}&lng=${longitude}&limit=1`
          );
          // Get total count from response if available
          providerCount = searchResponse.data?.providers?.length;
        } catch (err) {
          // Provider count is optional, don't fail if it errors
          console.log("Could not fetch provider count:", err);
        }

        setAvailability({
          in_zone: zoneResponse.data.in_zone,
          zones: zoneResponse.data.zones,
          provider_count: providerCount,
          isLoading: false,
          error: null,
        });
      } catch (error: any) {
        console.error("Error checking service availability:", error);
        setAvailability({
          in_zone: false,
          zones: [],
          isLoading: false,
          error: error.message || "Failed to check service availability",
        });
      }
    },
    []
  );

  const reset = useCallback(() => {
    setAvailability({
      in_zone: false,
      zones: [],
      isLoading: false,
      error: null,
    });
  }, []);

  return {
    availability,
    checkAvailability,
    reset,
  };
}
