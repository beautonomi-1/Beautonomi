"use client";

import { useState, useEffect } from "react";

interface UserLocation {
  latitude: number;
  longitude: number;
  address: string;
}

type IpGeoResponse = {
  data?: {
    latitude?: number | string | null;
    longitude?: number | string | null;
    city?: string | null;
    country?: string | null;
    region?: string | null;
  } | null;
};

/**
 * Hook to get and manage user location from localStorage
 * The location is set by the header component when user selects an address
 */
export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      let cancelled = false;
      const finish = () => {
        if (!cancelled) setIsLoading(false);
      };

      const loadIpFallback = async () => {
        try {
          const response = await fetch("/api/public/ip-geolocation", {
            credentials: "same-origin",
            // Do not use force-cache here — localStorage handles persistence.
            // force-cache would permanently cache a null result (private IP,
            // rate-limit hit, network blip) and block every future attempt.
            cache: "no-store",
          });
          if (!response.ok) return;
          const json = (await response.json().catch(() => null)) as IpGeoResponse | null;
          const data = json?.data;
          const latitude = Number(data?.latitude);
          const longitude = Number(data?.longitude);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
          const address = [data?.city, data?.region, data?.country].filter(Boolean).join(", ");
          const nextLocation = { latitude, longitude, address: address || "Current area" };
          localStorage.setItem("userLocation", JSON.stringify(nextLocation));
          if (!cancelled) {
            setLocation(nextLocation);
            window.dispatchEvent(new CustomEvent("userLocationChanged", { detail: nextLocation }));
          }
        } catch {
          // IP location is a best-effort guest enhancement; manual search still works.
        }
      };

      try {
        const savedLocation = localStorage.getItem("userLocation");
        if (savedLocation) {
          const parsed = JSON.parse(savedLocation);
          setLocation(parsed);
          finish();
        } else {
          void loadIpFallback().finally(finish);
        }
      } catch (error) {
        console.error("Error reading user location from localStorage:", error);
        void loadIpFallback().finally(finish);
      }

      return () => {
        cancelled = true;
      };
    }
  }, []);

  // Listen for storage changes and custom events (when location is updated)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "userLocation") {
        try {
          if (e.newValue) {
            const parsed = JSON.parse(e.newValue);
            setLocation(parsed);
          } else {
            setLocation(null);
          }
        } catch (error) {
          console.error("Error parsing location from storage event:", error);
        }
      }
    };

    const handleLocationChange = (e: CustomEvent) => {
      setLocation(e.detail);
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("userLocationChanged", handleLocationChange as EventListener);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("userLocationChanged", handleLocationChange as EventListener);
    };
  }, []);

  // Get location as query parameters for API calls
  const getLocationParams = () => {
    if (!location) return {};
    return {
      lat: location.latitude.toString(),
      lng: location.longitude.toString(),
    };
  };

  // Get location as URL search params string
  const getLocationQueryString = () => {
    if (!location) return "";
    return `?lat=${location.latitude}&lng=${location.longitude}`;
  };

  return {
    location,
    isLoading,
    getLocationParams,
    getLocationQueryString,
    hasLocation: !!location,
  };
}
