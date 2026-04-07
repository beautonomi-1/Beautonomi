"use client";

import { useState, useEffect, useCallback } from "react";
import { readAllowsFunctionalFromStorage } from "@/lib/cookie-consent/guards";

export interface RecentLocation {
  id: string;
  label?: string; // "Home", "Work", or custom
  address: string;
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  timestamp: number;
  isQuickShortcut?: boolean; // true for Home/Work
}

const STORAGE_KEY = "beautonomi_recent_locations";
const MAX_RECENT_LOCATIONS = 5;

/**
 * Hook to manage recent locations with quick shortcuts (Home/Work).
 * Persists to localStorage only when **functional** cookie consent is granted.
 */
export function useRecentLocations() {
  const [recentLocations, setRecentLocations] = useState<RecentLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const sync = () => {
      if (typeof window === "undefined") return;
      const allow = readAllowsFunctionalFromStorage();
      if (!allow) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        setRecentLocations([]);
        setIsLoading(false);
        return;
      }
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setRecentLocations(parsed);
        } else {
          setRecentLocations([]);
        }
      } catch (error) {
        console.error("Error loading recent locations:", error);
      } finally {
        setIsLoading(false);
      }
    };

    sync();
    window.addEventListener("beautonomi:cookie-consent-changed", sync);
    return () => window.removeEventListener("beautonomi:cookie-consent-changed", sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !readAllowsFunctionalFromStorage() || isLoading) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recentLocations));
    } catch (error) {
      console.error("Error saving recent locations:", error);
    }
  }, [recentLocations, isLoading]);

  const addLocation = useCallback((location: Omit<RecentLocation, "id" | "timestamp">) => {
    setRecentLocations((prev) => {
      const filtered = prev.filter(
        (loc) =>
          !(
            loc.latitude === location.latitude &&
            loc.longitude === location.longitude &&
            loc.address === location.address
          )
      );

      const newLocation: RecentLocation = {
        ...location,
        id: `${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
      };

      const updated = [newLocation, ...filtered].slice(0, MAX_RECENT_LOCATIONS);

      return updated;
    });
  }, []);

  const updateLocationLabel = useCallback((id: string, label: string) => {
    setRecentLocations((prev) =>
      prev.map((loc) => (loc.id === id ? { ...loc, label, isQuickShortcut: label === "Home" || label === "Work" } : loc))
    );
  }, []);

  const removeLocation = useCallback((id: string) => {
    setRecentLocations((prev) => prev.filter((loc) => loc.id !== id));
  }, []);

  const getQuickShortcuts = useCallback(() => {
    return recentLocations.filter((loc) => loc.isQuickShortcut);
  }, [recentLocations]);

  const getHomeLocation = useCallback(() => {
    return recentLocations.find((loc) => loc.label === "Home");
  }, [recentLocations]);

  const getWorkLocation = useCallback(() => {
    return recentLocations.find((loc) => loc.label === "Work");
  }, [recentLocations]);

  const clearAll = useCallback(() => {
    setRecentLocations([]);
  }, []);

  return {
    recentLocations,
    isLoading,
    addLocation,
    updateLocationLabel,
    removeLocation,
    getQuickShortcuts,
    getHomeLocation,
    getWorkLocation,
    clearAll,
  };
}
