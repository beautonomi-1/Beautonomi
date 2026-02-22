"use client";

import { useState, useEffect } from "react";

interface UserLocation {
  latitude: number;
  longitude: number;
  address: string;
}

/**
 * Hook to get and manage user location from localStorage
 * The location is set by the header component when user selects an address
 */
export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const savedLocation = localStorage.getItem("userLocation");
        if (savedLocation) {
          const parsed = JSON.parse(savedLocation);
          setLocation(parsed);
        }
      } catch (error) {
        console.error("Error reading user location from localStorage:", error);
      } finally {
        setIsLoading(false);
      }
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
