"use client";

import { useState, useEffect, useCallback } from "react";

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
 * Hook to manage recent locations with quick shortcuts (Home/Work)
 */
export function useRecentLocations() {
  const [recentLocations, setRecentLocations] = useState<RecentLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setRecentLocations(parsed);
        }
      } catch (error) {
        console.error("Error loading recent locations:", error);
      } finally {
        setIsLoading(false);
      }
    }
  }, []);

  // Save to localStorage whenever recentLocations changes
  useEffect(() => {
    if (typeof window !== "undefined" && !isLoading) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(recentLocations));
      } catch (error) {
        console.error("Error saving recent locations:", error);
      }
    }
  }, [recentLocations, isLoading]);

  const addLocation = useCallback((location: Omit<RecentLocation, "id" | "timestamp">) => {
    setRecentLocations((prev) => {
      // Remove if already exists (to avoid duplicates)
      const filtered = prev.filter(
        (loc) =>
          !(
            loc.latitude === location.latitude &&
            loc.longitude === location.longitude &&
            loc.address === location.address
          )
      );

      // Add new location at the beginning
      const newLocation: RecentLocation = {
        ...location,
        id: `${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
      };

      // Keep only MAX_RECENT_LOCATIONS
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
