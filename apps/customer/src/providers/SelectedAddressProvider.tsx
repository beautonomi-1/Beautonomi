"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SELECTED_ADDRESS_KEY = "beautonomi_selected_address";

export interface SelectedAddressValue {
  label: string;
  latitude: number;
  longitude: number;
  displayName: string;
}

/** True when lat/lng are usable for discovery, distance, and housecall booking. */
export function hasValidServiceCoordinates(
  value: { latitude?: number | null; longitude?: number | null } | null | undefined,
): boolean {
  if (!value) return false;
  const { latitude, longitude } = value;
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

interface SelectedAddressContextValue {
  selectedAddress: SelectedAddressValue | null;
  setSelectedAddress: (address: SelectedAddressValue | null) => void;
  isLoading: boolean;
}

const SelectedAddressContext = createContext<SelectedAddressContextValue | null>(null);

export function SelectedAddressProvider({ children }: { children: React.ReactNode }) {
  const [selectedAddress, setSelectedAddressState] = useState<SelectedAddressValue | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SELECTED_ADDRESS_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setSelectedAddressState(null);
          return;
        }
        try {
          const parsed = JSON.parse(raw) as SelectedAddressValue;
          if (
            typeof parsed?.latitude === "number" &&
            typeof parsed?.longitude === "number" &&
            typeof parsed?.displayName === "string"
          ) {
            setSelectedAddressState({
              label: typeof parsed.label === "string" ? parsed.label : "",
              latitude: parsed.latitude,
              longitude: parsed.longitude,
              displayName: parsed.displayName,
            });
          } else {
            setSelectedAddressState(null);
          }
        } catch {
          setSelectedAddressState(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSelectedAddress = useCallback((address: SelectedAddressValue | null) => {
    setSelectedAddressState(address);
    if (address == null) {
      AsyncStorage.removeItem(SELECTED_ADDRESS_KEY);
    } else {
      AsyncStorage.setItem(SELECTED_ADDRESS_KEY, JSON.stringify(address));
    }
  }, []);

  return (
    <SelectedAddressContext.Provider
      value={{ selectedAddress, setSelectedAddress, isLoading }}
    >
      {children}
    </SelectedAddressContext.Provider>
  );
}

export function useSelectedAddress() {
  const ctx = useContext(SelectedAddressContext);
  if (!ctx) {
    throw new Error("useSelectedAddress must be used within SelectedAddressProvider");
  }
  return ctx;
}
